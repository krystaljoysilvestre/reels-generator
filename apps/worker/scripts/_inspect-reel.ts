// Read-only operator view of one reel's persisted creative and cost artifacts.
// Usage: pnpm --filter worker exec tsx scripts/_inspect-reel.ts <reelId>
import '../src/env.js'

void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('usage: _inspect-reel <reelId>')

  const { getDb, reels, stories, pipelineSteps, scenes, assets } = await import('@reels/db')
  const { and, asc, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')
  const story = reel.storyId
    ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
    : null
  const steps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.reelId, reelId),
    orderBy: [asc(pipelineSteps.startedAt)],
  })
  const sceneRows = await db.query.scenes.findMany({
    where: eq(scenes.reelId, reelId),
    orderBy: [asc(scenes.idx)],
  })
  const assetRows = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const storyStep = await db.query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
  })

  console.log(`reel=${reel.id} status=${reel.status} cost=${reel.costCents}c story=${reel.storyId ?? 'none'}`)
  console.log(`seed=${reel.seedIdea ?? 'none'}`)
  console.log(`steps=${steps.map((s) => `${s.stepName}:${s.status}:${s.costCents ?? 0}c`).join(' | ')}`)
  console.log(`scenes=${sceneRows.length} assets=${assetRows.length}`)
  console.log('\n===== STORY =====\n')
  console.log(story?.body ?? '(none)')
  console.log('\n===== STORY STEP OUTPUT =====\n')
  console.log(JSON.stringify(storyStep?.output ?? null, null, 2))
  console.log('\n===== EVIDENCE BIBLE =====\n')
  console.log(JSON.stringify(reel.evidenceBible ?? null, null, 2))
  console.log('\n===== STORY BIBLE =====\n')
  console.log(JSON.stringify(reel.storyBible ?? null, null, 2))
  console.log('\n===== POST META =====\n')
  console.log(JSON.stringify(reel.postMeta ?? null, null, 2))
  process.exit(0)
})()
