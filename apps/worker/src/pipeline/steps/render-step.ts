import { eq, desc } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { downloadBuffer, uploadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, LutConfigSchema, CaptionStyleSchema, PLATFORM_PRESETS, effectsFromSelection, parseMotion } from '@reels/core'
import { renderReelWithRemotion } from '@reels/render/remotion/render-remotion'
import { runStep, setReelStatus } from '../harness.js'

const execFileAsync = promisify(execFile)

// The app's default watermark logo (R2 key) — burned onto every reel unless a channel overrides it.
const DEFAULT_WATERMARK_KEY = 'app/watermark.png'

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

  const inputHash = buildInputHash('render.remotion.v2', {
    sceneCount: reelScenes.length,
    // Hash the mix's row identity (createdAt), not its constant storage key — the key is fixed per reel,
    // so a re-mix (new audio) would otherwise reuse the previous render.
    mixAt: mixAsset.createdAt,
    onScreen: reelScenes.map((s) => s.onScreenText ?? '').join('|'),
    // Visual content: a regenerated image repoints imageAssetId; a re-animated clip appends a newer video
    // row. Include both or a reshoot followed by re-render would serve the old footage.
    images: reelScenes.map((s) => s.imageAssetId ?? 'none').join('|'),
    videos: reelScenes
      .map((s) => (s.tier === 'video' ? (pickVideoAsset(s.idx)?.createdAt.toISOString() ?? 'none') : 'still'))
      .join('|'),
    reelId,
  })

  const result = await runStep(
    { reelId, stepName: 'render', inputHash },
    async () => {
      const tmp = join(tmpdir(), `reels-render-${reelId}`)
      await mkdir(tmp, { recursive: true })
      try {

      // ── Download audio mix ──────────────────────────────────────────────
      const mixBuf = await downloadBuffer(mixAsset.storageKey)
      const mixPath = join(tmp, 'mix.m4a')
      await writeFile(mixPath, mixBuf)

      // ── Build scene inputs with local file paths ─────────────────────────
      type SceneInput = Parameters<typeof renderReelWithRemotion>[0]['scenes'][number]
      const sceneInputs: SceneInput[] = []

      for (const scene of reelScenes) {
        const timing = timings.scenes.find((s) => s.idx === scene.idx)
        if (!timing) continue

        // Image
        let imagePath = join(tmp, `scene_${scene.idx}_img.webp`)
        const imageAsset = scene.imageAssetId ? allAssets.find((a) => a.id === scene.imageAssetId) : null
        if (imageAsset) {
          await writeFile(imagePath, await downloadBuffer(imageAsset.storageKey))
        } else {
          // Black placeholder frame
          await execFileAsync('ffmpeg', [
            '-f', 'lavfi', '-i', 'color=black:s=1080x1920',
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

      // ── Step 1: Remotion renders the visual track (no audio) ─────────────
      const visualPath = join(tmp, 'visual.mp4')
      await renderReelWithRemotion({
        scenes: sceneInputs,
        subtitles: timings.subtitles,
        captionStyle,
        captionSafeZonePct,
        durationMs: timings.durationMs,
        grain: lutConfig.grain,
        vignette: lutConfig.vignette,
        watermark,
        outputPath: visualPath,
        onProgress: (p) => console.log(`  Remotion render: ${Math.round(p * 100)}%`),
      })

      // ── Step 2: FFmpeg applies LUT (if configured) ────────────────────────
      let gradedPath = visualPath
      if (lutConfig.lutPath) {
        gradedPath = join(tmp, 'graded.mp4')
        await execFileAsync('ffmpeg', [
          '-i', visualPath,
          '-vf', `lut3d=${lutConfig.lutPath}`,
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
          '-y', gradedPath,
        ])
      }

      // ── Step 3: FFmpeg muxes visual + audio → final reel ─────────────────
      const outputPath = join(tmp, 'reel.mp4')
      await execFileAsync('ffmpeg', [
        '-i', gradedPath,
        '-i', mixPath,
        '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-movflags', '+faststart',
        '-y', outputPath,
      ])

      // ── Upload ────────────────────────────────────────────────────────────
      const renderBuf = await readFile(outputPath)
      const storageKey = `reels/${reelId}/render.mp4`
      await uploadBuffer(storageKey, renderBuf, 'video/mp4')

      // Constant key per reel → a re-render upserts this row in place (bump createdAt for consistency).
      await db.insert(assets).values({
        reelId,
        channelId: reel.channelId,
        kind: 'render',
        storageKey,
        provider: 'local',
        costCents: 0,
        meta: { durationMs: timings.durationMs, renderer: 'remotion@4' },
      }).onConflictDoUpdate({
        target: [assets.reelId, assets.storageKey],
        set: {
          meta: { durationMs: timings.durationMs, renderer: 'remotion@4' },
          createdAt: new Date(),
        },
      })

      return { output: { storageKey }, costCents: 0 }
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
