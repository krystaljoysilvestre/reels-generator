// Diagnostic (Story Modes probe): re-run the story analyzer for a reel OUTSIDE runStep, print raw
// result or error — distinguishes "LLM genuinely extracted zero entities" from "call failed → fail-soft".
// Usage: tsx scripts/probe-analyzer.ts <reelId>
import '../src/env.js'
void (async () => {
  const [reelId] = process.argv.slice(2)
  const { getDb, reels, stories, channels } = await import('@reels/db')
  const { llmCall } = await import('@reels/providers')
  const { StoryBibleSchema, WorldBibleSchema, normalizeCanon } = await import('@reels/core')
  const { buildStoryAnalyzerPrompt, STORY_ANALYZER_V1_VERSION } = await import('../src/prompts-bridge.js')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId!) })
  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel!.storyId!) })
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel!.channelId) })
  const worldBible = WorldBibleSchema.parse(channel!.worldBible)
  const channelCanon = normalizeCanon(worldBible)
  const { system, userMessage } = buildStoryAnalyzerPrompt({
    narration: story!.body,
    channelCanon,
    nicheDescription: channel!.nicheDescription ?? '',
    era: worldBible.era,
    regionDescriptor: worldBible.region,
  })
  try {
    const llm = await llmCall({
      templateVersion: STORY_ANALYZER_V1_VERSION,
      schema: StoryBibleSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 4096,
    })
    console.log(JSON.stringify(llm.data, null, 2))
    console.log(`costCents=${llm.costCents}`)
  } catch (err) {
    console.error('ANALYZER CALL FAILED:', err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
})()
