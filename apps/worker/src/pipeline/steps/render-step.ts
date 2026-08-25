import { eq, desc } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, rm, copyFile } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels, assertVisualTruthReady } from '@reels/db'
import { downloadBuffer, uploadFile, buildInputHash } from '@reels/providers'
import { TimingsSchema, LutConfigSchema, CaptionStyleSchema, channelPlatformPreset, effectsFromSelection, parseMotion, effectiveGenre, computeMediaDisclosure, MediaOriginSchema,} from '@reels/core'
import { renderReelWithRemotion } from '@reels/render/remotion/render-remotion'
import { resolveMediaGenre } from '@reels/core/prompts/scenes.v1'
import { composeCover } from '../compose-cover.js'
import { runStep, setReelStatus } from '../harness.js'
import { runPool } from '../pool.js'

const execFileAsync = promisify(execFile)

// Scene media (stills + clips) is pulled from R2 concurrently. Bounded because each buffer is held whole in
// memory before it's written — 8 in flight keeps peak footprint modest on a 1080p long-form board.
const RENDER_FETCH_CONCURRENCY = 8

// The persistent media disclosure burned onto Evidence-Based Narrative reels is COMPUTED from what the reel
// actually contains (see computeMediaDisclosure), not from the channel flag alone. It used to be the constant
// 'Illustrated · based on documented sources'; once a reel can present a genuine archival photograph, that
// constant states something false about real media — it labels a real photograph an illustration.
// specs/evidence-based-narrative.md, specs/depictive-fidelity.md.

// Pick per-scene video effects from the scene's (AI-derived) mood + the channel genre. Pure mapping —
// no API call, so it's free; effects are composited at render time. Kept tasteful: gentle life on every
// still, and a hard flash + shake only on the sharpest shock beats of edgy genres.
function planSceneEffects(
  mood: string[],
  tier: 'still' | 'video',
  genre: string,
): Array<{ type: 'zoom' | 'shake' | 'glitch' | 'flash' | 'vhs'; intensity: number }> {
  const fx: Array<{ type: 'zoom' | 'shake' | 'glitch' | 'flash' | 'vhs'; intensity: number }> = []
  const edgy = genre === 'horror' || genre === 'general'
  const m = mood.join(' ').toLowerCase()
  const shock = /shock|terror|panic|scream|violent/.test(m)
  // Stills get their life from camera-move-driven Ken Burns in SceneClip now — no generic push-in here, or
  // it would fight a pull_out/locked move. Only the digital-unease effects remain mood-driven.
  //
  // Glitch is deliberately NOT auto-applied: its saturated RGB-split bars read as loud/attention-seeking
  // on nearly every tense horror beat and fight the atmosphere. Horror unease comes from grain + vignette
  // (LUT) + slow camera moves instead. Glitch stays available as an explicit operator selection
  // (effectsFromSelection), just not on the auto path.
  if (edgy && shock) { fx.push({ type: 'flash', intensity: 0.7 }); fx.push({ type: 'shake', intensity: 0.5 }) }
  return fx
}

export async function renderStep(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.timings) throw new Error(`Reel missing timings: ${reelId}`)
  await assertVisualTruthReady(reelId)

  const timings = TimingsSchema.parse(reel.timings)
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error('Channel not found')
  // Media/register genre for the grade: EBN → informational, so a documentary isn't graded like a
  // catastrophe. Mood (now register-appropriate from the fixed breakdown) still drives most of it. (resolveMediaGenre)
  // Frozen per-reel genre, not the channel's current one — a re-derived channel must not change how an
  // already-made reel renders (specs/channel-series.md).
  const mediaGenre = resolveMediaGenre({ storyMode: channel.storyMode, genreCategory: effectiveGenre(reel, channel), niche: channel.nicheDescription })
  const lutConfig = LutConfigSchema.parse(channel.lutConfig)
  const captionStyle = CaptionStyleSchema.parse(channel.captionStyle)
  const platformPreset = channelPlatformPreset(channel)
  const captionSafeZonePct = platformPreset.safeZoneBottomPct

  // Newest first: a re-mix or re-generated scene image/video appends a new row; render must pick the
  // current take. (Scene images are selected by the scene's imageAssetId pointer below, which already
  // tracks the latest; ordering covers the mix + per-scene video lookups.)
  const allAssets = await db.query.assets.findMany({
    where: eq(assets.reelId, reelId),
    orderBy: [desc(assets.createdAt)],
  })
  const reelScenes = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
  reelScenes.sort((a, b) => a.idx - b.idx)

  const mixAsset = allAssets.find((a) => (a.meta as Record<string, unknown>)['type'] === 'final_mix')
  if (!mixAsset) throw new Error('No final mix asset — run mix_audio first')

  // MEDIA DISCLOSURE — derived from the scenes' actual provenance, so the burned label describes what the
  // viewer is watching. A reel mixing generated illustration with genuine archival photographs must not call
  // all of it "Illustrated"; a reel that is entirely archival must not either.
  const hasArchivalScenes = reelScenes.some((s) => MediaOriginSchema.safeParse(s.imageOrigin).data?.usage === 'presented_archival')
  const hasGeneratedScenes = reelScenes.some((s) => MediaOriginSchema.safeParse(s.imageOrigin).data?.usage !== 'presented_archival')
  const mediaDisclosure = computeMediaDisclosure({
    hasGeneratedScenes,
    hasArchivalScenes,
    isEvidenceBacked: channel.storyMode === 'ebn',
  })

  // The hero clip a video-tier scene renders with — selected exactly as the render loop does below
  // (newest matching row wins via the createdAt ordering). Used both for the cache key and the render.
  const pickVideoAsset = (sceneIdx: number) =>
    allAssets.find(
      (a) =>
        a.kind === 'video' &&
        (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx &&
        (a.meta as Record<string, unknown>)['variationIdx'] === 0,
    )

  // Visual FINGERPRINT — everything that determines the rendered PIXELS and their timing. The graded visual
  // track is cached at reels/<id>/visual.mp4 and REUSED (skip the Remotion pass, just re-mux the new audio)
  // whenever this is unchanged. Audio-only changes (mix/music/sfx/levels/voice-that-keeps-duration) don't
  // touch it, so they become a ~seconds re-mux instead of a full multi-minute render. Must capture
  // EVERYTHING visual — a gap here would mux new audio onto a stale picture.
  const visualFingerprint = buildInputHash('reel.visual.v1', {
    durationMs: timings.durationMs,
    scenes: timings.scenes.map((s) => `${s.idx}:${s.startMs}:${s.endMs}:${s.tier}`).join('|'), // cut points
    subtitles: timings.subtitles.map((c) => `${c.startMs}-${c.endMs}:${c.text}`).join('|'),     // burned in
    images: reelScenes.map((s) => s.imageAssetId ?? 'none').join('|'),
    videos: reelScenes
      .map((s) => (s.tier === 'video' ? (pickVideoAsset(s.idx)?.createdAt.toISOString() ?? 'none') : 'still'))
      .join('|'),
    onScreen: reelScenes.map((s) => s.onScreenText ?? '').join('|'),
    moods: reelScenes.map((s) => (s.mood ?? []).join(',')).join('|'),   // auto effects derive from mood
    motions: reelScenes.map((s) => s.motionPrompt ?? '').join('|'),     // still Ken-Burns move derives from motion
    videoEffects: Array.isArray(reel.videoEffects) ? (reel.videoEffects as string[]).join(',') : 'auto',
    captionStyle: JSON.stringify(captionStyle),
    captionSafeZonePct,
    grain: lutConfig.grain,
    vignette: lutConfig.vignette,
    lut: lutConfig.lutPath ?? '',
    disclosure: mediaDisclosure, // in the fingerprint → the label changing (or the media mix changing) re-renders
    platform: platformPreset.label, // the resolved spec, so set order can't churn the fingerprint
    frame: `${platformPreset.width}x${platformPreset.height}`, // output dims (belt-and-suspenders to platform)
    endingFadeMs: timings.ending?.shape === 'ring_out' ? 1500 : timings.ending?.shape === 'resolve' ? 900 : 0,
  })

  // The render step re-runs when the visual OR the audio changes; INSIDE, the expensive Remotion pass is
  // gated by the visual fingerprint (cached visual reused across audio-only re-renders).
  const inputHash = buildInputHash('render.remotion.v3', {
    visual: visualFingerprint,
    // Re-mix (new audio) bumps the mix row's createdAt → re-run to re-mux (the visual is reused within).
    mixAt: mixAsset.createdAt,
    reelId,
  })

  const result = await runStep(
    { reelId, stepName: 'render', inputHash },
    async () => {
      const tmp = join(tmpdir(), `reels-render-${reelId}`)
      await mkdir(tmp, { recursive: true })
      // Sub-phase timing. The step has three very differently-shaped costs — pulling ~40 scene assets from R2
      // (network), the Remotion frame pass (CPU), and muxing + re-uploading a 350 MB file (network) — and the
      // step total alone can't tell you which one moved. Each phase logs its own elapsed seconds.
      const stepStartedMs = Date.now()
      const sinceStart = () => ((Date.now() - stepStartedMs) / 1000).toFixed(1)
      try {

      // ── Audio mix (always needed for the mux) ────────────────────────────
      const mixPath = join(tmp, 'mix.m4a')
      await writeFile(mixPath, await downloadBuffer(mixAsset.storageKey))

      const visualKey = `reels/${reelId}/visual.mp4`
      const gradedPath = join(tmp, 'graded.mp4') // the final graded visual to mux (cached or freshly rendered)

      // The cached-visual upload runs CONCURRENTLY with the mux + final upload below. The two only share the
      // local graded file, which both merely READ, so there's no ordering constraint.
      //
      // This is the one upload change that MEASURED well: both 355 MB files went up in 257s together
      // (~2.76 MB/s aggregate) where a single upload alone had managed 0.75–0.89 MB/s (2026-08-04). Upload
      // throughput scales with concurrent streams here, so overlapping is worth real minutes — it is NOT
      // merely hiding one upload behind the mux, which is a 3s stream copy and hides nothing.
      //
      // Kept FATAL, exactly as the sequential await was. The error is captured into a variable rather than
      // left on the promise only because a floating promise that rejects while we're awaiting the mux would
      // trip Node's unhandled-rejection process exit; it is rethrown at the join point below.
      let visualUpload: Promise<unknown> | null = null
      let visualUploadError: unknown = null

      // ── Reuse the cached graded visual when the fingerprint is unchanged (audio-only re-render) ──────
      // The prior render row records the fingerprint of the visual it produced. If it matches (and the
      // duration agrees — belt-and-suspenders against a fingerprint gap), the cached visual.mp4 is valid.
      const prevMeta = (allAssets.find((a) => a.kind === 'render')?.meta ?? {}) as Record<string, unknown>
      let reused = false
      if (prevMeta['visualFingerprint'] === visualFingerprint && prevMeta['durationMs'] === timings.durationMs) {
        try {
          await writeFile(gradedPath, await downloadBuffer(visualKey))
          reused = true
          console.log(`[render] visual unchanged — reusing cached track at ${sinceStart()}s, re-muxing audio only`)
        } catch {
          reused = false // cached file missing/unreadable → fall through to a full render
        }
      }

      if (!reused) {
        // ── Build scene inputs with local file paths ───────────────────────
        // Planned first (pure — no I/O), then every scene's media is fetched CONCURRENTLY. Worth doing, but
        // MEASURED SMALL: a 42-scene long-form board fetches in ~5s concurrently against a frame pass of ~29
        // minutes (2026-08-04), so this is tens of seconds saved, not minutes — don't mistake it for a render
        // optimisation. The step's real costs are the frame pass and the two 355 MB uploads below.
        // Order is preserved: reelScenes is already sorted by idx.
        type SceneInput = Parameters<typeof renderReelWithRemotion>[0]['scenes'][number]

        const planned = reelScenes.flatMap((scene) => {
          const timing = timings.scenes.find((s) => s.idx === scene.idx)
          if (!timing) return []
          const imageAsset = scene.imageAssetId ? allAssets.find((a) => a.id === scene.imageAssetId) : null
          // Video (operator picks from 2 variations; default to variationIdx=0)
          const videoAsset = scene.tier === 'video' ? pickVideoAsset(scene.idx) : undefined
          const dur = videoAsset ? (videoAsset.meta as Record<string, unknown>)['durationSec'] : undefined
          return [{
            scene,
            timing,
            imageAsset,
            videoAsset,
            imagePath: join(tmp, `scene_${scene.idx}_img.webp`),
            videoPath: videoAsset ? join(tmp, `scene_${scene.idx}_vid.mp4`) : null,
            videoDurationSec: typeof dur === 'number' ? dur : null,
          }]
        })

        await runPool(planned, RENDER_FETCH_CONCURRENCY, async (p) => {
          if (p.imageAsset) {
            await writeFile(p.imagePath, await downloadBuffer(p.imageAsset.storageKey))
          } else {
            // Black placeholder frame, at the platform's output dims
            await execFileAsync('ffmpeg', [
              '-f', 'lavfi', '-i', `color=black:s=${platformPreset.width}x${platformPreset.height}`,
              '-frames:v', '1', '-y', p.imagePath,
            ])
          }
          if (p.videoPath && p.videoAsset) {
            await writeFile(p.videoPath, await downloadBuffer(p.videoAsset.storageKey))
          }
        }, 'scene asset')
        console.log(`[render] fetched ${planned.length} scene assets in ${sinceStart()}s (concurrency ${RENDER_FETCH_CONCURRENCY})`)

        const sceneInputs: SceneInput[] = planned.map((p) => ({
          idx: p.scene.idx,
          imagePath: p.imagePath,
          videoPath: p.videoPath,
          tier: p.scene.tier as 'still' | 'video',
          startMs: p.timing.startMs,
          endMs: p.timing.endMs,
          mood: p.scene.mood,
          onScreenText: p.scene.onScreenText,
          // Still: the director's camera move (recovered from the stored motion text) drives Ken Burns.
          cameraMove: p.scene.tier === 'still' ? parseMotion(p.scene.motionPrompt).moveKey : null,
          videoDurationSec: p.videoDurationSec,
          // Operator's explicit per-reel selection wins; null → auto-plan from mood + genre.
          effects: Array.isArray(reel.videoEffects)
            ? effectsFromSelection(reel.videoEffects as string[], p.scene.tier as 'still' | 'video')
            : planSceneEffects(p.scene.mood, p.scene.tier as 'still' | 'video', mediaGenre),
        }))

        // ── Remotion renders the visual track (no audio) ─────────────────
        const visualPath = join(tmp, 'visual.mp4')
        // Remotion fires onProgress far more often than the percentage changes — unthrottled, a long-form
        // render emitted thousands of identical "1%" lines and buried everything useful around it. Log only
        // when the whole percent moves (≤101 lines), with elapsed seconds so the frame rate is readable.
        const renderStartedMs = Date.now()
        let lastLoggedPct = -1
        await renderReelWithRemotion({
          scenes: sceneInputs,
          subtitles: timings.subtitles,
          captionStyle,
          captionSafeZonePct,
          durationMs: timings.durationMs,
          width: platformPreset.width,
          height: platformPreset.height,
          grain: lutConfig.grain,
          vignette: lutConfig.vignette,
          ...(timings.ending?.shape === 'ring_out'
            ? { endingFadeMs: 1500 }
            : timings.ending?.shape === 'resolve'
              ? { endingFadeMs: 900 }
              : {}),
          ...(mediaDisclosure ? { disclosure: mediaDisclosure } : {}),
          outputPath: visualPath,
          onProgress: (p) => {
            const pct = Math.round(p * 100)
            if (pct === lastLoggedPct) return
            lastLoggedPct = pct
            console.log(`  Remotion render: ${pct}% (${((Date.now() - renderStartedMs) / 1000).toFixed(0)}s)`)
          },
        })

        console.log(`[render] Remotion frame pass done at ${sinceStart()}s`)

        // ── LUT grade (if configured) → gradedPath; else the raw visual IS the graded track ──────────
        if (lutConfig.lutPath) {
          await execFileAsync('ffmpeg', [
            '-i', visualPath,
            '-vf', `lut3d=${lutConfig.lutPath}`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-y', gradedPath,
          ])
        } else {
          await copyFile(visualPath, gradedPath)
        }

        // Cache the finished visual so future audio-only renders skip everything above and just re-mux.
        // Started, not awaited — see the visualUpload declaration above. Streams from disk so a 355 MB file
        // never becomes a heap Buffer, which matters with the final upload running alongside it.
        visualUpload = uploadFile(visualKey, gradedPath, 'video/mp4')
          .then(() => console.log(`[render] cached visual uploaded at ${sinceStart()}s`))
          .catch((err) => { visualUploadError = err })
      }

      // ── Mux graded visual + audio → final reel (pure stream copy; fast even on the reuse path) ────────
      // Audio is COPIED, not re-encoded: mix.m4a is already loudness-normalized AAC, and a second AAC
      // encode shifted integrated loudness enough to fail render_qa's -14 ±0.5 gate on crest-heavy mixes.
      const outputPath = join(tmp, 'reel.mp4')
      await execFileAsync('ffmpeg', [
        '-i', gradedPath,
        '-i', mixPath,
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-shortest',
        '-movflags', '+faststart',
        '-y', outputPath,
      ])

      console.log(`[render] muxed at ${sinceStart()}s — uploading final reel`)

      // ── Upload the final reel ──────────────────────────────────────────
      const storageKey = `reels/${reelId}/render.mp4`
      await uploadFile(storageKey, outputPath, 'video/mp4')
      console.log(`[render] muxed + uploaded final reel at ${sinceStart()}s${reused ? ' (reused cached visual)' : ''}`)

      // Join point for the concurrent cached-visual upload. Awaited BEFORE the asset row is written, so
      // meta.visualFingerprint never claims a cache that failed to upload — and rethrown, so a cache-upload
      // failure fails the step just as it did when this was a plain sequential await.
      if (visualUpload) {
        await visualUpload
        if (visualUploadError) throw visualUploadError
        console.log(`[render] all uploads settled at ${sinceStart()}s`)
      }

      // Constant key per reel → upsert in place; bump createdAt (drives the preview cache-bust + render_qa
      // re-validation). meta.visualFingerprint lets the NEXT render decide whether it can reuse the visual.
      const meta = { durationMs: timings.durationMs, renderer: 'remotion@4', visualFingerprint }
      await db.insert(assets).values({
        reelId,
        channelId: reel.channelId,
        kind: 'render',
        storageKey,
        provider: 'local',
        costCents: 0,
        meta,
      }).onConflictDoUpdate({
        target: [assets.reelId, assets.storageKey],
        set: { meta, createdAt: new Date() },
      })

      // ── Post cover (best-effort) ─────────────────────────────────────────
      // Lives in compose-cover.ts so it can also be rebuilt on its own when the creator edits the
      // packaging — the render step is no longer the only way to change a thumbnail. Still best-effort
      // here: a cover problem must never fail a reel that rendered.
      try {
        await composeCover({ reelId })
      } catch (err) {
        console.warn(`[render] cover skipped: ${err instanceof Error ? err.message : String(err)}`)
      }

      return { output: { storageKey, reused }, costCents: 0 }
      } finally {
        // Reclaim the per-render scratch dir (scene videos/images + graded intermediates + final mp4 —
        // 100+ MB) whether the render succeeded or threw, so repeated renders don't fill the disk.
        await rm(tmp, { recursive: true, force: true })
      }
    },
  )

  await db
    .update(reels)
    .set({ renderUrl: result.output.storageKey as string, status: 'render_qa', updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}
