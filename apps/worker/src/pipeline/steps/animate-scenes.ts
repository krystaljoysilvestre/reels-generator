import { eq } from 'drizzle-orm'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { generateVideo, buildInputHash, FalEngineSchema, downloadBuffer, llmCall, musicCostCents } from '@reels/providers'
import { TimingsSchema, channelPlatformPreset, budgetCapForSeconds } from '@reels/core'
import { buildVideoQAPrompt, VIDEO_QA_V1_VERSION, VideoQASchema } from '../../prompts-bridge.js'
import { spotFoleyForReel } from './foley-spot.js'
import { runStep } from '../harness.js'
import { runPool } from '../pool.js'

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
// Clips generate concurrently — each is a ~60s wait on Kling, so serially a reel's motion budget (3 clips
// short-form, up to 8 long-form) was minutes of dead time. Matched to the fal semaphore (providers/shared/
// limiter), which stays the authoritative cap on in-flight calls; this only bounds the step's own fan-out.
const VIDEO_CONCURRENCY = 4

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
  const aspect = channelPlatformPreset(channel ?? {}).aspect

  // Scene spans (from timings) decide clip length. Null/unparseable → every clip falls back to 5s.
  const timings = reel.timings ? TimingsSchema.safeParse(reel.timings) : null
  const spanSecByIdx = new Map<number, number>()
  if (timings?.success) {
    for (const t of timings.data.scenes) spanSecByIdx.set(t.idx, (t.endMs - t.startMs) / 1000)
  }

  // Sorted by idx: the budget walk below spends the reel's headroom in narration order, so the beats that
  // get demoted are deliberately the LAST ones (the opening + peak sit earliest and are protected).
  const videoScenes = (await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) }))
    .filter((s) => s.tier === 'video' && s.imageAssetId)
    .sort((a, b) => a.idx - b.idx)

  // One read of the reel's assets for the whole step (was re-queried per scene inside the loop). Indexed two
  // ways: by id for each scene's source still, and by sceneIdx for the clips that already exist.
  const reelAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const assetById = new Map(reelAssets.map((a) => [a.id, a]))
  const haveVariationByScene = new Map<number, Set<unknown>>()
  for (const a of reelAssets) {
    if (a.kind !== 'video') continue
    const m = a.meta as Record<string, unknown>
    const idx = m['sceneIdx']
    if (typeof idx !== 'number') continue
    if (!haveVariationByScene.has(idx)) haveVariationByScene.set(idx, new Set())
    haveVariationByScene.get(idx)!.add(m['variationIdx'])
  }

  const engine = FalEngineSchema.parse({})

  // GRACEFUL DEGRADATION (budget): animation is the priciest step, so rather than let a later clip trip the
  // per-reel cap and STRAND the reel mid-render, skip any clip that wouldn't leave room for the remaining
  // steps (music/mix/render/qa) — that scene stays a STILL (rendered with Ken Burns motion). Matters most on
  // long-form, where scene count scales with runtime but the cap tops out at BUDGET_CAP_MAX_CENTS, so the
  // last chapters are the ones at risk. Keep in sync with FAL_VIDEO_COST_CENTS_PER_SEC (providers/fal/config).
  const VIDEO_COST_CENTS_PER_SEC = 7
  // Per-clip allowance for the vision QA call that follows every generation. Small, but it has to be in the
  // projection: the sequential guard this replaced compared against the reel's ACTUAL accrued cost, which
  // already included the earlier clips' QA — so omitting it would make the projection drift under reality.
  const QA_PER_CLIP_CENTS = 1
  // The reserve has to track the reel's LENGTH, not a constant: the music bed is the biggest remaining
  // spend and it scales with runtime (a 5-minute bed is ~82¢ — more than a flat 50¢ reserve would have
  // protected, so the guard would have "succeeded" and then stranded the reel at the music step anyway).
  // The rest (mix, render, render_qa) is local ffmpeg plus one vision QA call.
  const QA_AND_MIX_RESERVE_CENTS = 30
  const DOWNSTREAM_RESERVE_CENTS = musicCostCents((channel?.targetSeconds ?? 75) * 1000) + QA_AND_MIX_RESERVE_CENTS
  const budgetCap = budgetCapForSeconds(channel?.targetSeconds)

  // ── Budget admission (decided up front, before any clip is generated) ──────────────────────────────
  // Clips run CONCURRENTLY below, so the guard can't be a read-then-spend check inside the loop: every
  // in-flight clip would read the same accrued cost, all conclude they fit, and collectively blow the cap.
  // Instead: read the accrued cost ONCE and walk the scenes in narration order, projecting each clip's cost
  // onto a running total. Same outcome as the sequential guard (headroom is spent earliest-first and the
  // tail demotes), but it's deterministic and independent of how the clips interleave.
  const startingCostCents = (await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { costCents: true } }))?.costCents ?? 0
  let projectedCostCents = startingCostCents
  const admitted: Array<{ scene: typeof videoScenes[number]; imageAsset: NonNullable<ReturnType<typeof assetById.get>>; durationSec: number; haveVariation: Set<unknown> }> = []
  // projectedAt is captured per scene: the running total AT THE MOMENT this clip was rejected, which is what
  // makes the warning below diagnosable (the final total would read the same for every demoted scene).
  const demoted: Array<{ scene: typeof videoScenes[number]; clipCost: number; projectedAt: number }> = []

  for (const scene of videoScenes) {
    const imageAsset = assetById.get(scene.imageAssetId!)
    if (!imageAsset) continue

    const haveVariation = haveVariationByScene.get(scene.idx) ?? new Set<unknown>()

    // Clip length from the scene's narration span: a beat longer than ~5s gets a 10s clip so it isn't
    // stretched thin at render.
    const spanSec = spanSecByIdx.get(scene.idx) ?? 0
    const durationSec = spanSec > 5.5 ? 10 : 5

    // An existing clip was already paid for (e.g. the operator pre-vetted it via the storyboard's "Preview
    // animation") — it costs nothing to reuse, so it never consumes projected headroom.
    if (haveVariation.has(0)) {
      admitted.push({ scene, imageAsset, durationSec, haveVariation })
      continue
    }

    const clipCost = durationSec * VIDEO_COST_CENTS_PER_SEC + QA_PER_CLIP_CENTS
    if (projectedCostCents + clipCost + DOWNSTREAM_RESERVE_CENTS > budgetCap) {
      demoted.push({ scene, clipCost, projectedAt: projectedCostCents })
      continue
    }
    projectedCostCents += clipCost
    admitted.push({ scene, imageAsset, durationSec, haveVariation })
  }

  // Demote the scenes that didn't fit to STILLS (rendered with Ken Burns motion) — a degraded-but-finished
  // reel beats one stranded mid-render by the per-reel cap.
  for (const { scene, clipCost, projectedAt } of demoted) {
    await db.update(scenes).set({ tier: 'still' }).where(eq(scenes.id, scene.id))
    console.warn(`[animate_scenes] ${reelId.slice(0, 8)} scene ${scene.idx}: budget headroom exhausted (${projectedAt}¢ projected + ${clipCost}¢ + ${DOWNSTREAM_RESERVE_CENTS}¢ reserve > ${budgetCap}¢ cap) → kept as a still (Ken Burns motion)`)
  }

  // ── Generate the admitted clips CONCURRENTLY ───────────────────────────────────────────────────────
  // Each clip is an independent ~60s wait on Kling plus a vision QA round trip, and each already owns its
  // own step row + storage key, so nothing is shared between them. Serially this was the sum of every clip's
  // round trip (a long-form reel's 8-clip budget ≈ 10 minutes of pure waiting); pooled it's the slowest one.
  await runPool(admitted, VIDEO_CONCURRENCY, async ({ scene, imageAsset, durationSec, haveVariation }) => {
    const variationCount = 1  // one clip per scene; render composites variationIdx 0

    // ACTUAL-COST BACKSTOP, re-read immediately before spending. The admission pass projects fal + QA exactly,
    // but it cannot know about a QA RE-ROLL — which regenerates a clip and can double its cost. On a reel where
    // several clips re-roll, the projection drifts under reality, and the thing at the end of that drift is the
    // failure the guard exists to prevent: runStep's assertBudget throwing mid-step and STRANDING the reel.
    // Concurrent workers can read the same value here, which is exactly why this is a backstop rather than the
    // primary guard — admission bounds the SET, this refuses to spend into a cap that reality has already hit.
    if (!haveVariation.has(0)) {
      const actual = (await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { costCents: true } }))?.costCents ?? 0
      const clipCost = durationSec * VIDEO_COST_CENTS_PER_SEC + QA_PER_CLIP_CENTS
      if (actual + clipCost + DOWNSTREAM_RESERVE_CENTS > budgetCap) {
        await db.update(scenes).set({ tier: 'still' }).where(eq(scenes.id, scene.id))
        console.warn(`[animate_scenes] ${reelId.slice(0, 8)} scene ${scene.idx}: admitted but headroom gone at spend time (${actual}¢ actual + ${clipCost}¢ + ${DOWNSTREAM_RESERVE_CENTS}¢ reserve > ${budgetCap}¢ cap) → kept as a still (Ken Burns motion)`)
        return
      }
    }

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

      // Per-scene/variation step row (not the bare 'animate_scenes') so concurrent clips don't collide on
      // one (reelId, stepName) ledger row — the collision hid failures from retry and stuck reels from the reaper.
      await runStep(
        { reelId, stepName: `animate_scenes:s${scene.idx}v${v}` as never, inputHash },
        async (cost) => {
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
            cost.add(result.costCents) // record spend the moment it's incurred, so a throw below doesn't lose it
            chosen = result

            const qa = await videoQA(result.asset.storageKey, durationSec, reelId, scene.idx)
            cost.add(qa.costCents)
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
            costCents: cost.total,
            meta: videoMeta,
          }).onConflictDoUpdate({
            target: [assets.reelId, assets.storageKey],
            set: {
              provider: 'fal',
              providerJobId: chosen!.providerJobId ?? null,
              costCents: cost.total,
              meta: videoMeta,
              createdAt: new Date(),
            },
          })

          return { output: { storageKey: chosen!.asset.storageKey }, costCents: cost.total }
        },
      )
    }
  }, 'clip')

  // Foley spotting: now that every video clip exists, watch each and lay sound on its visible motion.
  // Fail-soft and idempotent per clip take — never blocks the render.
  await spotFoleyForReel(reelId)
}
