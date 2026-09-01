// Read-only operator view of one reel's scene/render state.
// Usage: pnpm --filter worker exec tsx scripts/_inspect-scene-status.ts <reelId>
import '../src/env.js'

void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('usage: _inspect-scene-status <reelId>')
  const { getDb, reels, scenes, assets, pipelineSteps } = await import('@reels/db')
  const { and, asc, eq, inArray } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')
  const rows = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    orderBy: [asc(scenes.idx)],
  })
  const ids = rows.flatMap((scene) => scene.imageAssetId ? [scene.imageAssetId] : [])
  const assetRows = ids.length
    ? await db.query.assets.findMany({ where: inArray(assets.id, ids) })
    : []
  const byId = new Map(assetRows.map((asset) => [asset.id, asset]))
  const imageStep = await db.query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_images')),
  })
  console.log(JSON.stringify({
    reel: { status: reel.status, costCents: reel.costCents },
    imageStep: imageStep ? {
      status: imageStep.status,
      attempt: imageStep.attempt,
      costCents: imageStep.costCents,
      error: imageStep.error,
    } : null,
    scenes: rows.map((scene) => {
      const asset = scene.imageAssetId ? byId.get(scene.imageAssetId) : null
      const meta = (asset?.meta ?? {}) as Record<string, unknown>
      return {
        idx: scene.idx,
        tier: scene.tier,
        imageAssetId: scene.imageAssetId,
        provider: asset?.provider ?? null,
        assetCostCents: asset?.costCents ?? null,
        qaPass: meta.qaPass ?? null,
        qaIssues: meta.qaIssues ?? [],
        truthQaPass: meta.truthQaPass ?? null,
        truthQaIssues: meta.truthQaIssues ?? [],
        depictionBasis: scene.depictionBasis,
      }
    }),
  }, null, 2))
  process.exit(0)
})()
