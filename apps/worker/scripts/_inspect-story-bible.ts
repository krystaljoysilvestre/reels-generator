// Read-only operator view of the analyzed Story Bible for one reel.
// Usage: pnpm --filter worker exec tsx scripts/_inspect-story-bible.ts <reelId>
import '../src/env.js'

void (async () => {
  const [reelId] = process.argv.slice(2)
  if (!reelId) throw new Error('usage: _inspect-story-bible <reelId>')

  const { getDb, reels, stories, pipelineSteps } = await import('@reels/db')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error('reel not found')

  const story = reel.storyId
    ? await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
    : null
  const step = await db.query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
  })
  const output = step?.output as { story?: { peakMoment?: string } } | null
  console.log(JSON.stringify({
    story: story ? {
      title: story.title,
      body: story.body,
      logline: story.logline,
      twistAnchor: story.twistAnchor,
      generatedPeakMoment: output?.story?.peakMoment ?? null,
    } : null,
    storyBible: reel.storyBible ?? null,
  }, null, 2))
  process.exit(0)
})()
