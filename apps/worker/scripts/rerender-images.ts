// Re-render the images of an existing reel (story/analyze/breakdown untouched), to A/B a generate_images
// change against a prior run. Clears scene imageAssetId(s) + the reel's generate_images step rows so the
// render actually re-runs, then prints per-scene tags + the QA log. Optional <idx> re-renders ONLY that scene
// (cost-aware A/B of a single beat).
// Usage: pnpm --filter worker exec tsx scripts/rerender-images.ts <reelId> [sceneIdx]
import '../src/env.js'

void (async () => {
  const [reelId, idxArg] = process.argv.slice(2)
  if (!reelId) { console.error('usage: rerender-images <reelId> [sceneIdx]'); process.exit(1) }
  const onlyIdx = idxArg ? Number(idxArg) : null
  const { getDb, reels, scenes, pipelineSteps } = await import('@reels/db')
  const { generateImages } = await import('../src/pipeline/steps/generate-images.js')
  const { StoryBibleSchema } = await import('@reels/core')
  const { eq, and, asc } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) { console.error('reel not found'); process.exit(1) }
  const bible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null
  console.log(`reel ${reelId} — narrator=${bible?.continuity.narratorEntityId ?? '—'} perspective=${bible?.continuity.narratorPerspective ?? '—'}`)

  const scn = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId), orderBy: [asc(scenes.idx)] })
  console.log(`${scn.length} scenes (tags unchanged):`)
  scn.forEach((s) => console.log(`  #${String(s.idx).padStart(2)} ${s.tier.padEnd(5)} prim=${s.primaryEntity ?? '—'} sup=[${(s.supportingEntities ?? []).join(',')}]`))

  // Force a clean re-render: drop image links (all, or just the target scene) + the memoized
  // generate_images step rows.
  if (onlyIdx !== null) {
    await db.update(scenes).set({ imageAssetId: null }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, onlyIdx)))
    console.log(`\n(re-rendering ONLY scene #${onlyIdx})`)
  } else {
    await db.update(scenes).set({ imageAssetId: null }).where(eq(scenes.reelId, reelId))
  }
  await db.delete(pipelineSteps).where(and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_images')))

  console.log('\ngenerate_images (re-render with visibility splice) …')
  await generateImages(reelId)
  console.log('\nDONE')
  process.exit(0)
})()
