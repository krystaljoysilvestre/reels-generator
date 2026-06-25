import { eq } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { downloadBuffer, uploadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, LutConfigSchema, CaptionStyleSchema, PLATFORM_PRESETS, effectsFromSelection } from '@reels/core'
import { renderReelWithRemotion } from '@reels/render/remotion/render-remotion'
import { runStep, setReelStatus } from '../harness.js'

const execFileAsync = promisify(execFile)

// Pick per-scene video effects from the scene's (AI-derived) mood + the channel genre. Pure mapping —
// no API call, so it's free; effects are composited at render time. Kept tasteful: gentle life on every
// still, and digital unease (glitch/flash/shake) only on tense/shock beats of edgy genres.
const TENSE_FX_WORDS = [
  'tense', 'dread', 'fear', 'afraid', 'terror', 'horror', 'panic', 'menac', 'threat', 'ominous',
  'sinister', 'eerie', 'unsettl', 'creep', 'anxious', 'suspense', 'shock', 'violent', 'forebod', 'haunt',
]
function planSceneEffects(
  mood: string[],
  tier: 'still' | 'video',
  genre: string,
): Array<{ type: 'zoom' | 'shake' | 'glitch' | 'flash' | 'vhs'; intensity: number }> {
  const fx: Array<{ type: 'zoom' | 'shake' | 'glitch' | 'flash' | 'vhs'; intensity: number }> = []
  const edgy = genre === 'horror' || genre === 'general'
  const m = mood.join(' ').toLowerCase()
  const tense = TENSE_FX_WORDS.some((k) => m.includes(k))
  const shock = /shock|terror|panic|scream|violent/.test(m)
  if (tier === 'still') fx.push({ type: 'zoom', intensity: 0.5 }) // slow push-in so stills feel alive
  if (edgy && tense) fx.push({ type: 'glitch', intensity: shock ? 0.9 : 0.45 })
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

  const allAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const reelScenes = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
  reelScenes.sort((a, b) => a.idx - b.idx)

  const mixAsset = allAssets.find((a) => (a.meta as Record<string, unknown>)['type'] === 'final_mix')
  if (!mixAsset) throw new Error('No final mix asset — run mix_audio first')

  const inputHash = buildInputHash('render.remotion.v1', {
    sceneCount: reelScenes.length,
    mixKey: mixAsset.storageKey,
    onScreen: reelScenes.map((s) => s.onScreenText ?? '').join('|'),
    reelId,
  })

  const result = await runStep(
    { reelId, stepName: 'render', inputHash },
    async () => {
      const tmp = join(tmpdir(), `reels-render-${reelId}`)
      await mkdir(tmp, { recursive: true })

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
        if (scene.tier === 'video') {
          const videoAsset = allAssets.find(
            (a) =>
              a.kind === 'video' &&
              (a.meta as Record<string, unknown>)['sceneIdx'] === scene.idx &&
              (a.meta as Record<string, unknown>)['variationIdx'] === 0,
          )
          if (videoAsset) {
            videoPath = join(tmp, `scene_${scene.idx}_vid.mp4`)
            await writeFile(videoPath, await downloadBuffer(videoAsset.storageKey))
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
          // Operator's explicit per-reel selection wins; null → auto-plan from mood + genre.
          effects: Array.isArray(reel.videoEffects)
            ? effectsFromSelection(reel.videoEffects as string[], scene.tier as 'still' | 'video')
            : planSceneEffects(scene.mood, scene.tier as 'still' | 'video', channel.genreCategory ?? 'general'),
        })
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

      await db.insert(assets).values({
        reelId,
        channelId: reel.channelId,
        kind: 'render',
        storageKey,
        provider: 'local',
        costCents: 0,
        meta: { durationMs: timings.durationMs, renderer: 'remotion@4' },
      }).onConflictDoNothing()

      return { output: { storageKey }, costCents: 0 }
    },
  )

  await db
    .update(reels)
    .set({ renderUrl: result.output.storageKey as string, status: 'render_qa', updatedAt: new Date() })
    .where(eq(reels.id, reelId))
}
