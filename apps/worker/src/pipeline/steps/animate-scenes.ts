import { eq, and } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { generateVideo, buildInputHash, FalEngineSchema, downloadBuffer, llmCall } from '@reels/providers'
import { TimingsSchema, PLATFORM_PRESETS } from '@reels/core'
import { buildVideoQAPrompt, VIDEO_QA_V1_VERSION, VideoQASchema } from '../../prompts-bridge.js'
import { spotFoleyForReel } from './foley-spot.js'
import { runStep } from '../harness.js'

// animate_scenes — step 8 (docs/02 §4)
// tier=video scenes only. One clip per scene (render composites variationIdx 0). Model audio stripped
// at render.
// CLIP LENGTH: Kling supports 5s or 10s; we pick by the scene's narration SPAN (from timings) so a hero
//   line longer than 5s gets a 10s clip instead of freezing/looping at render.
// VIDEO QA: i2v is where faces melt / hands warp / identities morph — and the opening is always animated,
//   so the most-watched shot is the most at risk. We sample two frames (mid + last) and vision-check them;
//   a fail re-rolls ONCE (i2v is stochastic). Improves rather than gates — a reel is never failed on it.

const execFileAsync = promisify(execFile)
const VIDEO_QA_MODEL = 'claude-haiku-4-5-20251001' // vision QA runs on Claude (the QA provider) — cheap + sees frames
const MAX_VIDEO_QA_REROLLS = 1 // one extra attempt on a clear-artifact verdict; more rarely converges and just burns cost

// Pull two frames from a clip for QA: its midpoint and ~just before the end (distortion accumulates over
// the clip, so the last frame is the highest-signal one). Returns PNG buffers in time order.
async function extractQAFrames(videoBuf: Buffer, durationSec: number, reelId: string, sceneIdx: number): Promise<Buffer[]> {
  const dir = join(tmpdir(), `reels-vqa-${reelId}-s${sceneIdx}`)
  await mkdir(dir, { recursive: true })
  try {
    const inPath = join(dir, 'clip.mp4')
    await writeFile(inPath, videoBuf)

    const midPath = join(dir, 'mid.png')
    const lastPath = join(dir, 'last.png')
    // Input-seek (-ss/-sseof before -i) is fast and frame-accurate enough for a still grab.
    await execFileAsync('ffmpeg', ['-ss', String(Math.max(0, durationSec / 2)), '-i', inPath, '-frames:v', '1', '-y', midPath])
    await execFileAsync('ffmpeg', ['-sseof', '-0.2', '-i', inPath, '-frames:v', '1', '-y', lastPath])
    // Frames are read into memory here, so the dir can be removed as we return.
    return [await readFile(midPath), await readFile(lastPath)]
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

// Vision QA of a generated clip for animation artifacts. Fail-soft: any error (ffmpeg/vision) → treat as a
// pass so QA never blocks the render. Returns the verdict + its cost.
async function videoQA(videoStorageKey: string, durationSec: number, reelId: string, sceneIdx: number): Promise<{ pass: boolean; issues: string[]; costCents: number }> {
  try {
    const buf = await downloadBuffer(videoStorageKey)
    const frames = await extractQAFrames(buf, durationSec, reelId, sceneIdx)
    const { system, userMessage } = buildVideoQAPrompt()
    const r = await llmCall({
      templateVersion: VIDEO_QA_V1_VERSION,
      schema: VideoQASchema,
      provider: 'anthropic',
      model: VIDEO_QA_MODEL,
      system,
      messages: [
        {
          role: 'user',
          content: [
            ...frames.map((f) => ({ type: 'image' as const, mediaType: 'image/png' as const, base64: f.toString('base64') })),
            { type: 'text' as const, text: userMessage },
          ],
        },
      ],
    })
    return { pass: r.data.pass, issues: r.data.issues, costCents: r.costCents }
  } catch (err) {
    console.warn(`[video-qa] ${reelId.slice(0, 8)} scene${sceneIdx} QA skipped (error): ${err instanceof Error ? err.message : String(err)}`)
    return { pass: true, issues: [], costCents: 0 }
  }
}

export async function animateScenes(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)

  // Clip aspect must match the channel's output frame (the scene stills are already generated in it).
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const aspect = (PLATFORM_PRESETS[(channel?.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all).aspect

  // Scene spans (from timings) decide clip length. Null/unparseable → every clip falls back to 5s.
  const timings = reel.timings ? TimingsSchema.safeParse(reel.timings) : null
  const spanSecByIdx = new Map<number, number>()
  if (timings?.success) {
    for (const t of timings.data.scenes) spanSecByIdx.set(t.idx, (t.endMs - t.startMs) / 1000)
  }

  const videoScenes = (
    await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
  ).filter((s) => s.tier === 'video' && s.imageAssetId)

  const engine = FalEngineSchema.parse({})

  for (const scene of videoScenes) {
    // Get the image asset storage key
    const imageAsset = await db.query.assets.findFirst({
      where: eq(assets.id, scene.imageAssetId!),
    })
    if (!imageAsset) continue

    const variationCount = 1  // one clip per scene; render composites variationIdx 0

    // Skip variations that already have a video asset — e.g. the operator pre-vetted this scene via the
    // storyboard's "Preview animation" button. Reuses that paid work instead of regenerating at render.
    const existing = await db.query.assets.findMany({
      where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')),
    })
    const haveVariation = new Set(
      existing
        .filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === scene.idx)
        .map((a) => (a.meta as Record<string, unknown>)['variationIdx']),
    )

    // Clip length from the scene's narration span: a beat longer than ~5s gets a 10s clip so it isn't
    // stretched thin at render.
    const spanSec = spanSecByIdx.get(scene.idx) ?? 0
    const durationSec = spanSec > 5.5 ? 10 : 5

    for (let v = 0; v < variationCount; v++) {
      if (haveVariation.has(v)) continue
      const inputHash = buildInputHash('animate_scenes.v1', {
        imageKey: imageAsset.storageKey,
        motionPrompt: scene.motionPrompt ?? '',
        durationSec,
        aspect,
        variationIdx: v,
        reelId,
        sceneIdx: scene.idx,
      })

      await runStep(
        { reelId, stepName: 'animate_scenes', inputHash: `${inputHash}:s${scene.idx}v${v}` as never },
        async () => {
          let totalCost = 0
          let chosen: Awaited<ReturnType<typeof generateVideo>> | undefined
          let lastIssues: string[] = []

          // Each attempt regenerates (i2v is stochastic) and overwrites the same storage key, so stopping
          // at the first pass leaves the passing clip in place.
          for (let attempt = 0; attempt <= MAX_VIDEO_QA_REROLLS; attempt++) {
            const result = await generateVideo({
              imageStorageKey: imageAsset.storageKey,
              motionPrompt: scene.motionPrompt ?? 'slow cinematic drift',
              durationSec,
              aspect,
              reelId,
              sceneIdx: scene.idx,
              variationIdx: v,
              engine,
            })
            totalCost += result.costCents
            chosen = result

            const qa = await videoQA(result.asset.storageKey, durationSec, reelId, scene.idx)
            totalCost += qa.costCents
            lastIssues = qa.issues
            if (qa.pass) {
              lastIssues = []
              if (attempt > 0) console.log(`[video-qa] ${reelId.slice(0, 8)} scene${scene.idx} passed on re-roll ${attempt}`)
              break
            }
            const tag = attempt < MAX_VIDEO_QA_REROLLS ? 're-rolling' : 'keeping (no pass)'
            console.warn(`[video-qa] ${reelId.slice(0, 8)} scene${scene.idx} attempt ${attempt} artifacts → ${tag}: ${qa.issues.join('; ')}`)
          }

          const videoMeta = {
            ...chosen!.asset.meta,
            sceneIdx: scene.idx,
            variationIdx: v,
            // qaIssues rides on meta so a later pass can flag "this hero clip may warp" to the operator.
            ...(lastIssues.length ? { qaIssues: lastIssues } : {}),
            // Model audio is stripped in the render step — not here
          }
          // The clip's key is constant per (scene, variation) — a re-animation upserts this row in place
          // and bumps createdAt so render (which hashes the selected clip's createdAt) re-renders.
          await db.insert(assets).values({
            reelId,
            channelId: reel.channelId,
            kind: 'video',
            storageKey: chosen!.asset.storageKey,
            provider: 'fal',
            providerJobId: chosen!.providerJobId ?? null,
            costCents: totalCost,
            meta: videoMeta,
          }).onConflictDoUpdate({
            target: [assets.reelId, assets.storageKey],
            set: {
              provider: 'fal',
              providerJobId: chosen!.providerJobId ?? null,
              costCents: totalCost,
              meta: videoMeta,
              createdAt: new Date(),
            },
          })

          return { output: { storageKey: chosen!.asset.storageKey }, costCents: totalCost }
        },
      )
    }
  }

  // Foley spotting: now that every video clip exists, watch each and lay sound on its visible motion.
  // Fail-soft and idempotent per clip take — never blocks the render.
  await spotFoleyForReel(reelId)
}
