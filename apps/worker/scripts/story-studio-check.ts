// One-reel live check of the STUDIO story pipeline (Planner → Writer → Editor → Naturalizer →
// Gate) — story stage only, no images/audio. Prints every persisted artifact so the attribution
// trail can be eyeballed: the plan (+whyThisStory), raw-vs-final prose, stage statuses, gate
// verdict, peak resolution, and cost.
// Usage: pnpm --filter worker exec tsx scripts/story-studio-check.ts <channelId>
import '../src/env.js'

void (async () => {
  const [channelId] = process.argv.slice(2)
  if (!channelId) { console.error('usage: story-studio-check <channelId>'); process.exit(1) }
  const { getDb, reels, channels, stories, pipelineSteps } = await import('@reels/db')
  const { generateStory } = await import('../src/pipeline/steps/generate-story.js')
  const { eq, and } = await import('drizzle-orm')
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) { console.error('channel not found'); process.exit(1) }
  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const [reel] = await db.insert(reels).values({ channelId, status: 'drafting', language }).returning()
  const reelId = reel!.id
  console.log(`studio check — reel ${reelId} (mode=${process.env.STORY_PLANNING_MODE ?? 'studio'})\n`)

  await generateStory(reelId, channelId, language)

  const r = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const story = await db.query.stories.findFirst({ where: eq(stories.id, r!.storyId!) })
  const step = await db.query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
  })
  const out = step?.output as Record<string, unknown> & {
    v?: number
    plan?: Record<string, unknown> | null
    writerRaw?: { narration?: string }
    editor?: unknown
    naturalizer?: unknown
    gate?: unknown
    peakResolution?: string
    plannerStatus?: string
    angleId?: string
  }

  console.log(`output v=${out?.v} plannerStatus=${out?.plannerStatus} angle=${out?.angleId}`)
  console.log('\n─── PLAN ' + '─'.repeat(60))
  console.log(JSON.stringify(out?.plan, null, 2))
  console.log('\n─── WRITER RAW ' + '─'.repeat(54))
  console.log(out?.writerRaw?.narration ?? '(missing)')
  console.log('\n─── FINAL (post edit + naturalize) ' + '─'.repeat(34))
  console.log(story?.body ?? '(none)')
  console.log('\n─── STAGES ' + '─'.repeat(58))
  console.log(`editor:      ${JSON.stringify(out?.editor)}`)
  console.log(`naturalizer: ${JSON.stringify(out?.naturalizer)}`)
  console.log(`gate:        ${JSON.stringify(out?.gate)}`)
  console.log(`peak:        ${out?.peakResolution} — twist_anchor=${story?.twistAnchor === null ? 'NULL' : JSON.stringify(story?.twistAnchor)}`)
  if (story?.twistAnchor && !story.body.includes(story.twistAnchor)) {
    console.error('❌ INTEGRITY: twist_anchor is NOT a substring of body')
    process.exit(1)
  }
  console.log(`\ncost so far: $${((r!.costCents ?? 0) / 100).toFixed(2)} — reel left at '${r!.status}' (story gate)`)
  process.exit(0)
})()
