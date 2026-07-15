import { eq } from 'drizzle-orm'
import { getDb, reels, stories, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import {
  WorldBibleSchema,
  StoryBibleSchema,
  EMPTY_STORY_BIBLE,
  normalizeCanon,
  mergeBible,
  preserveLockedEntities,
  validateJourneyTransitions,
  type StoryBible,
} from '@reels/core'
import { buildStoryAnalyzerPrompt, STORY_ANALYZER_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// analyze_story produces a TEXT-ONLY bible — no images. Reference plates used to be minted here for every
// entity, but that paid for plates on entities the story never uses (channel-canon noise) and before the
// operator had reviewed the cast at all. Plates are now minted lazily in generate_images, only for entities
// the SCENES actually reference (see generate-images.ts) — so the bible_review gate is free + text-only.

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

  // Operator-locked entities from a prior derive are HUMAN TRUTH — carried forward so a re-run can't
  // overwrite a correction (and their already-minted plates are reused, not re-paid).
  const priorBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null

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
      let bible: StoryBible
      let cost = 0
      // Long-form: the journey's verbatim leg spans together approach the narration's own length, so a
      // multi-minute story overruns the 4096 default mid-journey. Scale headroom with the input.
      const analyzerMaxTokens = story.body.length > 5000 ? 8192 : 4096
      try {
        const llm = await llmCall({
          templateVersion: STORY_ANALYZER_V1_VERSION,
          schema: StoryBibleSchema,
          system,
          messages: [{ role: 'user', content: userMessage }],
          maxTokens: analyzerMaxTokens,
        })
        cost = llm.costCents
        // Re-parse to recover the resolved output type (defaults applied) — zod's input type is loose
        // because of the schema defaults, so the generic on llmCall infers the optional-fields shape.
        let analyzed: StoryBible = StoryBibleSchema.parse(llm.data)

        // Journey transition validation → ONE repair round (mirrors the breakdown's repair). Catches the
        // narrator "teleporting" between enclosed spaces with no movement leg. Conservative — usually no-op.
        const journeyIssues = validateJourneyTransitions(analyzed.continuity.journey)
        if (journeyIssues.length > 0) {
          console.warn(`[analyze-story] ${reelId.slice(0, 8)} journey has ${journeyIssues.length} transition issue(s) → repair`)
          const repair = await llmCall({
            templateVersion: STORY_ANALYZER_V1_VERSION,
            schema: StoryBibleSchema,
            system,
            messages: [
              { role: 'user', content: userMessage },
              { role: 'assistant', content: JSON.stringify(llm.data) },
              { role: 'user', content: `Fix these journey continuity problems, then return the corrected FULL JSON only:\n- ${journeyIssues.join('\n- ')}\nInsert the missing movement legs so the narrator never teleports; keep everything else unchanged.` },
            ],
            maxTokens: analyzerMaxTokens,
          })
          cost += repair.costCents
          analyzed = StoryBibleSchema.parse(repair.data)
        }

        // Resolve the final bible: channel canon + this story's extraction (analyzer wins on shared ids).
        bible = mergeBible(channelCanon, analyzed)
      } catch (err) {
        console.warn(`[analyze-story] ${reelId.slice(0, 8)} analysis failed, persisting canon-only bible: ${err instanceof Error ? err.message : String(err)}`)
        bible = mergeBible(channelCanon, EMPTY_STORY_BIBLE)
      }
      // Carry forward any operator-locked entities (and their plates) so a re-derive can't clobber edits.
      bible = preserveLockedEntities(bible, priorBible)
      return { output: bible, costCents: cost }
    },
  )

  await db.update(reels).set({ storyBible: result.output }).where(eq(reels.id, reelId))
}
