// Recover the approved Tylenol reel after fal motion generation exhausted its queue retries.
// Charges submitted-but-timed-out calls at the documented per-second rate, keeps any usable clip,
// demotes only missing clips to the approved still fallback, and resumes at music generation.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const FAILED_ATTEMPTS = new Map<number, number>([
    [1, 3],
    [2, 2],
    [5, 3],
  ])
  const ESTIMATE_STEP = 'animate_scenes:timeout-estimate'

  const { getDb, reels, scenes, assets, pipelineSteps } = await import('@reels/db')
  const { budgetCapForSeconds, TimingsSchema, transition } = await import('@reels/core')
  const { FAL_VIDEO_COST_CENTS_PER_SEC } = await import('@reels/providers')
  const { enqueueStep } = await import('@reels/queue')
  const { and, eq, inArray, sql } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  if (!reel.timings) throw new Error('reel timings not found')
  if (reel.status !== 'failed' && reel.status !== 'rendering') {
    throw new Error(`expected failed/rendering reel, got ${reel.status}`)
  }

  const timings = TimingsSchema.parse(reel.timings)
  const durationByScene = new Map(
    timings.scenes.map((scene) => [scene.idx, (scene.endMs - scene.startMs) / 1000 > 5.5 ? 10 : 5]),
  )
  const estimateCents = [...FAILED_ATTEMPTS].reduce((total, [sceneIdx, attempts]) => {
    const durationSec = durationByScene.get(sceneIdx)
    if (!durationSec) throw new Error(`missing timings for scene ${sceneIdx}`)
    return total + durationSec * FAL_VIDEO_COST_CENTS_PER_SEC * attempts
  }, 0)

  const videoAssets = await db.query.assets.findMany({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.kind, 'video')),
  })
  const usableSceneIdxs = new Set(
    videoAssets.flatMap((asset) => {
      const idx = (asset.meta as Record<string, unknown>)['sceneIdx']
      return typeof idx === 'number' ? [idx] : []
    }),
  )
  const failedSceneIdxs = [...FAILED_ATTEMPTS.keys()].filter((idx) => !usableSceneIdxs.has(idx))

  await db.transaction(async (tx) => {
    const existingEstimate = await tx.query.pipelineSteps.findFirst({
      where: and(eq(pipelineSteps.reelId, REEL_ID), eq(pipelineSteps.stepName, ESTIMATE_STEP)),
    })
    if (!existingEstimate) {
      const projected = reel.costCents + estimateCents
      const cap = budgetCapForSeconds(80)
      if (projected > cap) throw new Error(`timeout estimate would exceed cap: ${projected}c > ${cap}c`)

      await tx.insert(pipelineSteps).values({
        reelId: REEL_ID,
        stepName: ESTIMATE_STEP,
        status: 'done',
        attempt: 1,
        output: {
          basis: `${FAL_VIDEO_COST_CENTS_PER_SEC}c/sec documented Kling rate`,
          failedAttempts: Object.fromEntries(FAILED_ATTEMPTS),
          estimatedCostCents: estimateCents,
          note: 'Conservative estimate for submitted calls that timed out before provider usage returned.',
        },
        costCents: estimateCents,
        startedAt: new Date(),
        finishedAt: new Date(),
      })
      await tx
        .update(reels)
        .set({ costCents: sql`${reels.costCents} + ${estimateCents}` })
        .where(eq(reels.id, REEL_ID))
    }

    if (failedSceneIdxs.length > 0) {
      await tx
        .update(scenes)
        .set({ tier: 'still' })
        .where(and(eq(scenes.reelId, REEL_ID), inArray(scenes.idx, failedSceneIdxs)))

      for (const idx of failedSceneIdxs) {
        await tx
          .update(pipelineSteps)
          .set({
            status: 'done',
            error: null,
            output: { fallback: 'still', reason: 'motion provider retries exhausted' },
            finishedAt: new Date(),
          })
          .where(and(eq(pipelineSteps.reelId, REEL_ID), eq(pipelineSteps.stepName, `animate_scenes:s${idx}v0`)))
      }
    }

    const nextStatus = reel.status === 'failed' ? transition('failed', 'rendering') : 'rendering'
    await tx
      .update(reels)
      .set({
        status: nextStatus,
        alertNote: 'Motion timed out on two scenes; approved stills are used there. Review continuity at spot check.',
        updatedAt: new Date(),
      })
      .where(eq(reels.id, REEL_ID))
  })

  await enqueueStep({ reelId: REEL_ID, stepName: 'generate_music' })
  console.log(
    `[audit] recorded ${estimateCents}c timeout estimate; kept motion scenes ${[...usableSceneIdxs].join(',') || 'none'}; ` +
      `demoted scenes ${failedSceneIdxs.join(',') || 'none'}; enqueued generate_music`,
  )
  process.exit(0)
})()
