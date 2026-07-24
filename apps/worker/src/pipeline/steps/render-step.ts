import { eq, desc } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile, rm, copyFile } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { downloadBuffer, uploadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, LutConfigSchema, CaptionStyleSchema, PLATFORM_PRESETS, PostMetaSchema, effectsFromSelection, parseMotion } from '@reels/core'
import { renderReelWithRemotion, renderThumbnailStill } from '@reels/render/remotion/render-remotion'
import { runStep, setReelStatus } from '../harness.js'

const execFileAsync = promisify(execFile)

// The app's default watermark logo (R2 key) — burned onto every reel unless a channel overrides it.
const DEFAULT_WATERMARK_KEY = 'app/watermark.png'

// Persistent synthetic-media/illustration disclosure burned onto Evidence-Based Narrative reels — the
// visuals are illustration, and the label makes that explicit to the viewer (specs/evidence-based-narrative.md).
const EBN_DISCLOSURE_LABEL = 'Illustrated · based on documented sources'

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

  const timings = TimingsSchema.parse(reel.timings)
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error('Channel not found')
  const lutConfig = LutConfigSchema.parse(channel.lutConfig)
  const captionStyle = CaptionStyleSchema.parse(channel.captionStyle)
  const platformPreset = PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all
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
    watermark: channel.watermarkKey ?? DEFAULT_WATERMARK_KEY,
    disclosure: channel.storyMode === 'ebn' ? EBN_DISCLOSURE_LABEL : '', // in the fingerprint → EBN reels re-render if it changes
    platform: channel.targetPlatform ?? 'all',
    frame: `${platformPreset.width}x${platformPreset.height}`, // output dims (belt-and-suspenders to platform)
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
      try {

      // ── Audio mix (always needed for the mux) ────────────────────────────
      const mixPath = join(tmp, 'mix.m4a')
      await writeFile(mixPath, await downloadBuffer(mixAsset.storageKey))

      const visualKey = `reels/${reelId}/visual.mp4`
      const gradedPath = join(tmp, 'graded.mp4') // the final graded visual to mux (cached or freshly rendered)

      // ── Reuse the cached graded visual when the fingerprint is unchanged (audio-only re-render) ──────
      // The prior render row records the fingerprint of the visual it produced. If it matches (and the
      // duration agrees — belt-and-suspenders against a fingerprint gap), the cached visual.mp4 is valid.
      const prevMeta = (allAssets.find((a) => a.kind === 'render')?.meta ?? {}) as Record<string, unknown>
      let reused = false
      if (prevMeta['visualFingerprint'] === visualFingerprint && prevMeta['durationMs'] === timings.durationMs) {
        try {
          await writeFile(gradedPath, await downloadBuffer(visualKey))
          reused = true
          console.log('[render] visual unchanged — reusing cached track, re-muxing audio only')
        } catch {
          reused = false // cached file missing/unreadable → fall through to a full render
        }
      }

      if (!reused) {
        // ── Build scene inputs with local file paths ───────────────────────
        type SceneInput = Parameters<typeof renderReelWithRemotion>[0]['scenes'][number]
        const sceneInputs: SceneInput[] = []

        for (const scene of reelScenes) {
          const timing = timings.scenes.find((s) => s.idx === scene.idx)
          if (!timing) continue

          // Image
          const imagePath = join(tmp, `scene_${scene.idx}_img.webp`)
          const imageAsset = scene.imageAssetId ? allAssets.find((a) => a.id === scene.imageAssetId) : null
          if (imageAsset) {
            await writeFile(imagePath, await downloadBuffer(imageAsset.storageKey))
          } else {
            // Black placeholder frame, at the platform's output dims
            await execFileAsync('ffmpeg', [
              '-f', 'lavfi', '-i', `color=black:s=${platformPreset.width}x${platformPreset.height}`,
              '-frames:v', '1', '-y', imagePath,
            ])
          }

          // Video (operator picks from 2 variations; default to variationIdx=0)
          let videoPath: string | null = null
          let videoDurationSec: number | null = null
          if (scene.tier === 'video') {
            const videoAsset = pickVideoAsset(scene.idx)
            if (videoAsset) {
              videoPath = join(tmp, `scene_${scene.idx}_vid.mp4`)
              await writeFile(videoPath, await downloadBuffer(videoAsset.storageKey))
              const dur = (videoAsset.meta as Record<string, unknown>)['durationSec']
              videoDurationSec = typeof dur === 'number' ? dur : null
            }
          }

          sceneInputs.push({
            idx: scene.idx,
            imagePath,
            videoPath,
            tier: scene.tier as 'still' | 'video',
            startMs: timing.startMs,
            endMs: timing.endMs,
            mood: scene.mood,
            onScreenText: scene.onScreenText,
            // Still: the director's camera move (recovered from the stored motion text) drives Ken Burns.
            cameraMove: scene.tier === 'still' ? parseMotion(scene.motionPrompt).moveKey : null,
            videoDurationSec,
            // Operator's explicit per-reel selection wins; null → auto-plan from mood + genre.
            effects: Array.isArray(reel.videoEffects)
              ? effectsFromSelection(reel.videoEffects as string[], scene.tier as 'still' | 'video')
              : planSceneEffects(scene.mood, scene.tier as 'still' | 'video', channel.genreCategory ?? 'general'),
          })
        }

        // Roaming watermark: the APP brands every reel with its logo by default (DEFAULT_WATERMARK_KEY); a
        // channel MAY override with its own key. Inlined as a data URI so the Remotion bundle stays
        // self-contained (no external fetch under its CSP).
        const wmKey = channel.watermarkKey ?? DEFAULT_WATERMARK_KEY
        let watermark: { dataUri: string; opacity: number } | null = null
        if (wmKey) {
          try {
            const buf = await downloadBuffer(wmKey)
            const mime = wmKey.endsWith('.png') ? 'image/png' : wmKey.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
            watermark = { dataUri: `data:${mime};base64,${buf.toString('base64')}`, opacity: 0.28 }
          } catch (err) {
            console.warn(`[render] watermark load failed (${wmKey}): ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        // ── Remotion renders the visual track (no audio) ─────────────────
        const visualPath = join(tmp, 'visual.mp4')
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
          watermark,
          ...(channel.storyMode === 'ebn' ? { disclosure: EBN_DISCLOSURE_LABEL } : {}),
          outputPath: visualPath,
          onProgress: (p) => console.log(`  Remotion render: ${Math.round(p * 100)}%`),
        })

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
        await uploadBuffer(visualKey, await readFile(gradedPath), 'video/mp4')
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

      // ── Upload the final reel ──────────────────────────────────────────
      const storageKey = `reels/${reelId}/render.mp4`
      await uploadBuffer(storageKey, await readFile(outputPath), 'video/mp4')

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

      // ── Post thumbnail (best-effort): hero frame + composited title ──────
      // 1280×720 for YouTube packaging; the export zip and publish flows prefer it over the raw frame.
      // Skipped without complaint when there's no title or no hero image — never fails the render.
      try {
        const postMeta = PostMetaSchema.safeParse(reel.postMeta)
        const heroScene =
          reelScenes.find((s) => s.isHero && s.imageAssetId) ?? reelScenes.find((s) => s.imageAssetId)
        const heroAsset = heroScene?.imageAssetId ? allAssets.find((a) => a.id === heroScene.imageAssetId) : null
        if (postMeta.success && postMeta.data.title && heroAsset) {
          const heroPath = join(tmp, 'thumb_hero.webp')
          await writeFile(heroPath, await downloadBuffer(heroAsset.storageKey))
          const thumbPath = join(tmp, 'thumbnail.jpg')
          await renderThumbnailStill({ imagePath: heroPath, title: postMeta.data.title, outputPath: thumbPath })
          const thumbKey = `reels/${reelId}/thumbnail.jpg`
          await uploadBuffer(thumbKey, await readFile(thumbPath), 'image/jpeg')
          const thumbMeta = { role: 'thumbnail', title: postMeta.data.title }
          await db.insert(assets).values({
            reelId,
            channelId: reel.channelId,
            kind: 'image',
            storageKey: thumbKey,
            provider: 'local',
            costCents: 0,
            meta: thumbMeta,
          }).onConflictDoUpdate({
            target: [assets.reelId, assets.storageKey],
            set: { meta: thumbMeta, createdAt: new Date() },
          })
        }
      } catch (err) {
        console.warn(`[render] thumbnail skipped: ${err instanceof Error ? err.message : String(err)}`)
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
