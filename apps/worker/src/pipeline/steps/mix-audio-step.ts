import { eq, desc } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, reels, assets, channels } from '@reels/db'
import { downloadBuffer, uploadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, AudioScriptSchema, AudioPacksSchema, musicIntensityToDb, moodMatchScore, peakFracForType, buildFoleyEvents, type FoleyAssetMeta } from '@reels/core'
import { mixAudio, premixSfx, type StemPaths } from '@reels/render/ffmpeg/mix-audio'
import { findImpactMs } from '@reels/render/ffmpeg/audio-analysis'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { runStep } from '../harness.js'

// Deterministic per-reel pick from the bed pool: same reel always draws the same bed (stable on
// re-run / idempotent), but different reels spread across the pool — variety without per-reel gen.
function pickReelIndex(seed: string, n: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0
  return h % n
}

// Mood-match THIS reel to the best bed in the pool: score each bed by how many of its moodTags the
// reel wants, pick the highest. No reel-mood signal (or no overlap) → fall back to the deterministic
// per-reel pick. So bespoke AI beds (core/intense/calm) + multi-preset pools both fit the story.
function pickBedForMood<T extends { moodTags: string[] }>(pool: T[], reelMoodTags: string[], reelId: string): T {
  if (reelMoodTags.length > 0) {
    // Bucket-based match (mood-match.ts) so rich story moods (dread/grief) fit generic bed tags
    // (dark/tense) via shared canonical buckets — not brittle exact-string overlap.
    let bestIdx = -1
    let bestScore = 0
    pool.forEach((bed, i) => {
      const score = moodMatchScore(reelMoodTags, bed.moodTags)
      if (score > bestScore) { bestScore = score; bestIdx = i }
    })
    if (bestIdx >= 0) return pool[bestIdx]!
  }
  return pool[pickReelIndex(reelId, pool.length)]!
}

export async function mixAudioStep(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.timings || !reel.audioScript) throw new Error(`Reel missing timings or audioScript: ${reelId}`)

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found`)
  const audioPacks = AudioPacksSchema.parse(channel.audioPacks)

  // Collect all assets for this reel, newest first — so a re-synthesized voiceover or a fresh mix picks
  // the current take, not an earlier row left behind by a re-run.
  const allAssets = await db.query.assets.findMany({
    where: eq(assets.reelId, reelId),
    orderBy: [desc(assets.createdAt)],
  })
  const isFinalMix = (a: (typeof allAssets)[number]) => (a.meta as Record<string, unknown>)['type'] === 'final_mix'
  const voiceover = allAssets.find((a) => a.kind === 'voiceover')
  // The final mix is itself stored with kind 'ambient' (meta.type = 'final_mix') — must exclude it here,
  // or a re-mix would layer the PREVIOUS full mix (voiceover + music + sfx) back in as the ambient bed.
  const ambient = allAssets.find((a) => a.kind === 'ambient' && !isFinalMix(a))
  const allSfx = allAssets.filter((a) => a.kind === 'sfx')
  // Foley (spotted to a clip's visible motion) carries meta.foley + sceneIdx/clipMs instead of a narration
  // anchor, so it takes a separate placement path (buildFoleyEvents) from the anchored designer cues.
  const foleyAssets = allSfx.filter((a) => (a.meta as Record<string, unknown>)['foley'] === true)
  const sfxAssets = allSfx.filter((a) => (a.meta as Record<string, unknown>)['foley'] !== true)
  if (!voiceover) throw new Error('No voiceover asset')

  // v5: detected-impact alignment + ambient dip in silenceDrop. v6: sustained loop cues (endMs spans).
  // v7: iterative loudness convergence (crest-heavy jumpscare mixes drifted past ±0.5 LU in one pass).
  // v8: foley (motion-synced SFX) merge + persisted stems. v9: SFX bus +6→+2. v10 (Phase A): reference
  // gain-staging (voice/music/ambient normalized to VOICE_REF_LUFS before offsets → bed audibly present),
  // SFX bus +2→+4, duck ratio 3→2, room-tone ambient fallback. Mixer behavior changed, so cached mixes are
  // stale even when the inputs hash the same — bump to force a re-mix.
  // v11: the music bed and room tone now RESOLVE across the outro tail instead of being hard-cut at
  // full level (§4.65) — the mix changes for any reel whose timings carry a tail.
  const inputHash = buildInputHash('mix_audio.v11', {
    // Hash the voiceover's row identity (createdAt), not its constant storage key — the key never changes
    // across re-synthesis, so hashing it would reuse a stale mix after a voice change.
    voiceoverAt: voiceover.createdAt,
    ambientKey: ambient?.storageKey ?? 'none',
    sfxCount: sfxAssets.length,
    // sfxAssets is newest-first, so [0].createdAt is the freshest SFX row. Count alone can't tell a
    // regenerated same-size SFX set apart from the old one; this makes a re-gen force a fresh mix.
    sfxNewestAt: sfxAssets[0]?.createdAt ?? 'none',
    // Placement identity: re-timed events (moved anchors, new sustained endMs spans) must re-mix even
    // when the assets themselves are unchanged — the premix is built FROM these timestamps.
    sfxSpans: timings.sfxEvents.map((e) => `${e.atMs}-${e.endMs ?? ''}@${e.volumeDb}`).join('|'),
    // Foley identity: placement derives from scene spans + clip times, so both must re-mix on change.
    foleyNewestAt: foleyAssets[0]?.createdAt ?? 'none',
    foleySpans: foleyAssets
      .map((a) => { const m = a.meta as FoleyAssetMeta; return `${m.sceneIdx}:${m.clipMs}@${m.volumeDb}` })
      .sort()
      .join('|'),
    sceneSpans: timings.scenes.map((s) => `${s.idx}:${s.startMs}-${s.endMs}`).join('|'),
    hasMusic: !!timings.music,
    musicKey: reel.musicKey ?? 'none', // AI bed → re-mix when the per-reel bed (re)generates
    reelId,
  })

  const result = await runStep(
    { reelId, stepName: 'mix_audio', inputHash },
    async () => {
      const tmp = join(tmpdir(), `reels-${reelId}`)
      await mkdir(tmp, { recursive: true })
      try {

      // Download assets to tmp dir
      const voiceoverBuf = await downloadBuffer(voiceover.storageKey)
      const voiceoverPath = join(tmp, 'voiceover.mp3')
      await writeFile(voiceoverPath, voiceoverBuf)

      // Ambient — synthesize a low room-tone if no ambient asset exists. Was `anullsrc` (TRUE digital
      // silence), which is a defect: voice-over-dead-air reads as empty/broken ("no continuous background").
      // A dark pink-noise bed reads as "room", not silence. Level doesn't matter here — the mixer reference-
      // normalizes ambient to AMBIENT_DB under the voice — so we only need a measurable, non-silent signal.
      const ambientPath = join(tmp, 'ambient.mp3')
      if (ambient) {
        const buf = await downloadBuffer(ambient.storageKey)
        await writeFile(ambientPath, buf)
      } else {
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const exec = promisify(execFile)
        await exec('ffmpeg', [
          '-f', 'lavfi', '-i', 'anoisesrc=color=pink:r=44100:amplitude=0.1',
          '-af', 'lowpass=f=500,highpass=f=40',  // dark low rumble, not white hiss
          '-t', String(timings.durationMs / 1000),
          '-c:a', 'libmp3lame', '-y', ambientPath,  // ambientPath is .mp3 → mp3 encoder, not aac
        ])
        console.log(`[mix] ${reelId} no ambient asset — synthesized room-tone fallback (mixer normalizes its level)`)
      }

      // Pre-mix SFX. sfxAssets is newest-first (allAssets is desc by createdAt), so take the FIRST asset
      // per anchor — the current design's take — and skip the rest. Without this, the 50+ accumulated
      // assets from past renders whose anchors coincidentally match get layered in as stale duplicates.
      const sfxEvents: { storageKey: string; atMs: number; volumeDb: number; endMs?: number }[] = []
      const usedAnchors = new Set<string>()
      for (const sfxAsset of sfxAssets) {
        const meta = sfxAsset.meta as { anchor?: string; durationMs?: number; impactAtEnd?: boolean }
        if (!meta.anchor || usedAnchors.has(meta.anchor)) continue
        const event = timings.sfxEvents.find((e) => e.anchor === meta.anchor)
        if (event) {
          usedAnchors.add(meta.anchor)
          const buf = await downloadBuffer(sfxAsset.storageKey)
          const localPath = join(tmp, `sfx_${sfxAsset.id}.mp3`)
          await writeFile(localPath, buf)
          // A build-to-hit cue (riser/swell) must land its IMPACT on the anchor, not its start. We detect
          // the clip's actual loudest transient and start the clip so THAT lands on the anchor — robust to
          // ElevenLabs not placing the hit at the clip's end, and the post-impact tail rings out past the
          // anchor for free. Fall back to clip length if detection fails. Instant one-shots fire on the
          // anchor. adelay clamps at 0 (never negative).
          let startMs = event.atMs
          if (meta.impactAtEnd) {
            const impactMs = (await findImpactMs(localPath)) ?? meta.durationMs ?? 2000
            startMs = Math.max(0, event.atMs - impactMs)
          }
          // Sustained cue: carry the span end through — premixSfx loops the clip to fill [atMs, endMs].
          sfxEvents.push({ storageKey: localPath, atMs: startMs, volumeDb: event.volumeDb, ...(event.endMs != null ? { endMs: event.endMs } : {}) })
        }
      }
      // Foley: map each spotted clip-motion cue to reel time (scene span + shared playback math), dedupe
      // against the anchored cues already placed, then add to the premix as point cues.
      const placedFoley = buildFoleyEvents({
        foley: foleyAssets.map((a) => ({ storageKey: a.storageKey, createdAt: a.createdAt, meta: a.meta as FoleyAssetMeta })),
        sceneSpans: timings.scenes.map((s) => ({ idx: s.idx, startMs: s.startMs, endMs: s.endMs })),
        anchoredAtMs: timings.sfxEvents.map((e) => e.atMs),
      })
      let foleyIdx = 0
      for (const f of placedFoley) {
        const buf = await downloadBuffer(f.storageKey)
        const localPath = join(tmp, `foley_${foleyIdx++}.mp3`)
        await writeFile(localPath, buf)
        sfxEvents.push({ storageKey: localPath, atMs: f.atMs, volumeDb: f.volumeDb })
      }
      if (placedFoley.length) console.log(`[mix] ${reelId} +${placedFoley.length} foley cue(s) from animated clips`)

      const sfxPremixPath = join(tmp, 'sfx_premix.aac')
      await premixSfx({
        sfxEvents,
        durationMs: timings.durationMs,
        outputPath: sfxPremixPath,
        tmpDir: tmp,
      })

      // Source THIS reel's bed (one coherent bed; the mixer's envelope swells it toward the twist):
      //  • operator-UPLOADED bed → overrides everything (any channel mode), rights are the operator's.
      //  • AI-music channels → the reel's OWN generated bed (generate_music), tailored to its story.
      //  • preset/upload     → mood-match a bed from the channel's track pool.
      //  • none / AI-bed-missing → empty pool, the mixer renders without music.
      const reelMoods = audioScript.music?.moodTags ?? []
      let localMusicPack: typeof audioPacks.musicPack = []

      if (reel.musicUploadKey) {
        console.log(`[mix] ${reelId} using operator-uploaded bed`)
        const ext = reel.musicUploadKey.split('.').pop() || 'mp3'
        const musicLocalPath = join(tmp, `music-upload.${ext}`)
        await writeFile(musicLocalPath, await downloadBuffer(reel.musicUploadKey))
        localMusicPack = [{ id: 'upload', path: musicLocalPath, type: audioScript.music?.type ?? 'low_drone', peakFrac: 0, moodTags: [] }]
      } else {
        const pool =
          audioPacks.musicMode === 'ai'
            ? reel.musicKey
              ? [{
                  id: 'reel',
                  path: reel.musicKey,
                  type: audioScript.music?.type ?? 'low_drone',
                  peakFrac: peakFracForType(audioScript.music?.type ?? 'low_drone'),
                  moodTags: reelMoods,
                }]
              : []
            : audioPacks.musicPack
        localMusicPack = pool
        if (pool.length > 0) {
          const picked = pickBedForMood(pool, reelMoods, reelId)
          console.log(`[mix] ${reelId} music mode=${audioPacks.musicMode} bed=${picked.id} mood=[${picked.moodTags.join(',')}] (reel mood=[${reelMoods.join(',')}])`)
          const ext = picked.path.split('.').pop() || 'mp3'
          const musicLocalPath = join(tmp, `music.${ext}`)
          await writeFile(musicLocalPath, await downloadBuffer(picked.path))
          localMusicPack = [{ ...picked, path: musicLocalPath }]
        }
      }

      // Presence guard: if the design INTENDED a bed but none resolved (AI mode with no generated musicKey,
      // or a preset channel with an empty pool), we still mix — never fail the reel — but surface the gap on
      // the channel page instead of silently shipping voice-over-silence. An intended `music: null` (a calm
      // register's deliberate choice) is respected: musicIntended is false there, so this stays quiet.
      const musicIntended = audioScript.music != null
      if (musicIntended && localMusicPack.length === 0 && !reel.musicUploadKey) {
        console.warn(`[mix] WARN ${reelId} music intended (${audioScript.music?.type}) but no bed available (mode=${audioPacks.musicMode}, musicKey=${reel.musicKey ? 'set' : 'none'}) — mixing without a bed`)
        await db.update(reels)
          .set({ alertNote: `Sound: a music bed was intended but none was available (music mode: ${audioPacks.musicMode}).`, updatedAt: new Date() })
          .where(eq(reels.id, reelId))
      }

      // Full mix — music loudness follows the channel's intensity setting (Sound step).
      const mixPath = join(tmp, 'mix.m4a')
      const stemPaths: StemPaths = {
        voice: join(tmp, 'stem_voice.m4a'),
        music: join(tmp, 'stem_music.m4a'),
        sfx: join(tmp, 'stem_sfx.m4a'),
        ambient: join(tmp, 'stem_ambient.m4a'),
      }
      const { bedDb, peakDb } = musicIntensityToDb(audioPacks.musicIntensity)
      await mixAudio({
        voiceoverPath,
        ambientPath,
        sfxPremixedPath: sfxPremixPath,
        musicPack: localMusicPack,
        timings,
        outputPath: mixPath,
        musicType: audioScript.music?.type ?? null,
        musicMoodTags: audioScript.music?.moodTags ?? [],
        bedDb,
        peakDb,
        stemPaths,
      })

      // Upload result
      const { readFile } = await import('node:fs/promises')
      const mixBuf = await readFile(mixPath)
      const storageKey = `reels/${reelId}/mix.m4a`
      await uploadBuffer(storageKey, mixBuf, 'audio/mp4')

      // Register as asset. Constant key per reel → a re-mix upserts this row in place and bumps createdAt
      // so render (which hashes the mix's createdAt) re-renders against the new audio.
      await db.insert(assets).values({
        reelId,
        channelId: reel.channelId,
        kind: 'ambient',   // reusing 'ambient' kind for the final mix (meta.type='final_mix' distinguishes it)
        storageKey,
        provider: 'local',
        costCents: 0,
        meta: { type: 'final_mix', durationMs: timings.durationMs },
      }).onConflictDoUpdate({
        target: [assets.reelId, assets.storageKey],
        set: {
          kind: 'ambient',
          meta: { type: 'final_mix', durationMs: timings.durationMs },
          createdAt: new Date(),
        },
      })

      // Persist the 4 layer stems (pre-loudnorm) for rebalancing / per-layer QA / the future mixer feature.
      // Constant keys per reel → upsert in place, bump createdAt (same pattern as the final mix).
      const { readFile: readFileForStem } = await import('node:fs/promises')
      for (const layer of ['voice', 'music', 'sfx', 'ambient'] as const) {
        const stemKey = `reels/${reelId}/stems/${layer}.m4a`
        await uploadBuffer(stemKey, await readFileForStem(stemPaths[layer]), 'audio/mp4')
        const stemMeta = { type: 'stem', layer, durationMs: timings.durationMs, loudnormApplied: false, note: 'pre-loudnorm layer; summed stems ≈ mix minus final loudness gain' }
        await db.insert(assets).values({
          reelId,
          channelId: reel.channelId,
          kind: 'stem',
          storageKey: stemKey,
          provider: 'local',
          costCents: 0,
          meta: stemMeta,
        }).onConflictDoUpdate({
          target: [assets.reelId, assets.storageKey],
          set: { kind: 'stem', meta: stemMeta, createdAt: new Date() },
        })
      }

      return { output: { storageKey }, costCents: 0 }
      } finally {
        // Reclaim the per-mix scratch dir (voiceover + sfx clips + premix + final mix) on success or
        // failure so repeated mixes don't accumulate on disk.
        await rm(tmp, { recursive: true, force: true })
      }
    },
  )
}
