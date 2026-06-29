import { eq } from 'drizzle-orm'
import { getDb, reels, stories, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import { WorldBibleSchema, StoryBibleSchema, EMPTY_STORY_BIBLE, normalizeCanon, mergeBible, type StoryBible } from '@reels/core'
import { buildStoryAnalyzerPrompt, STORY_ANALYZER_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// analyze_story — builds the per-reel Story Bible (symbol table of recurring entities) BEFORE the scene
// breakdown, so the breakdown references entities and the assembler splices their frozen descriptions
// for visual continuity (see specs/story-bible.md).
//
// Fail-soft: the bible strictly ADDS continuity, so a failure must never reduce reliability below today's.
// If the analyzer LLM fails we still persist a canon-only bible (channel-recurring entities survive) and
// mark the step done — breakdown then degrades to inventing this story's entities inline, as it does now.

export async function analyzeStory(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) throw new Error(`Reel has no story: ${reelId}`)

  const [story, channel] = await Promise.all([
    db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
  ])
  if (!story || !channel) throw new Error('Story or channel not found')

  const worldBible = WorldBibleSchema.parse(channel.worldBible)
  const channelCanon = normalizeCanon(worldBible)

  const { system, userMessage } = buildStoryAnalyzerPrompt({
    narration: story.body,
    channelCanon,
    nicheDescription: channel.nicheDescription ?? '',
    era: worldBible.era,
    regionDescriptor: worldBible.region,
  })

  // channelCanon is in the hash so a channel-canon change re-derives the bible; narration covers story edits.
  const inputHash = buildInputHash(STORY_ANALYZER_V1_VERSION, { narration: story.body, channelCanon })

  const result = await runStep(
    { reelId, stepName: 'analyze_story', inputHash },
    async () => {
      try {
        const llm = await llmCall({
          templateVersion: STORY_ANALYZER_V1_VERSION,
          schema: StoryBibleSchema,
          system,
          messages: [{ role: 'user', content: userMessage }],
        })
        // Re-parse to recover the resolved output type (defaults applied) — zod's input type is loose
        // because of the schema defaults, so the generic on llmCall infers the optional-fields shape.
        const analyzed: StoryBible = StoryBibleSchema.parse(llm.data)
        // Resolve the final bible: channel canon + this story's extraction (analyzer wins on shared ids).
        return { output: mergeBible(channelCanon, analyzed), costCents: llm.costCents }
      } catch (err) {
        console.warn(`[analyze-story] ${reelId.slice(0, 8)} analysis failed, persisting canon-only bible: ${err instanceof Error ? err.message : String(err)}`)
        return { output: mergeBible(channelCanon, EMPTY_STORY_BIBLE), costCents: 0 }
      }
    },
  )

  await db.update(reels).set({ storyBible: result.output }).where(eq(reels.id, reelId))
}
