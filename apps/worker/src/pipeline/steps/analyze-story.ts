import { eq } from 'drizzle-orm'
import { getDb, reels, stories, channels } from '@reels/db'
import { llmCall, buildInputHash } from '@reels/providers'
import {
  WorldBibleSchema,
  allowsRealWorldEntityPlates,
  StoryBibleSchema,
  EMPTY_STORY_BIBLE,
  normalizeCanon,
  mergeBible,
  preserveLockedEntities,
  resolveChannelPolicy,
  validateAppearanceBindings,
  validateJourneyTiling,
  validateJourneyTransitions,
  type StoryBible,
} from '@reels/core'
import { buildStoryAnalyzerPrompt, STORY_ANALYZER_V1_VERSION, buildIdentityStateCriticPrompt, IDENTITY_STATE_CRITIC_V1_VERSION, IdentityStateCriticSchema } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'
import { routeDepiction } from '../depiction-routing.js'

class IdentityStateGateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IdentityStateGateError'
  }
}

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
  const sourcePolicy = resolveChannelPolicy(reel, null, channel)

  // Operator-locked entities from a prior derive are HUMAN TRUTH — carried forward so a re-run can't
  // overwrite a correction (and their already-minted plates are reused, not re-paid).
  const priorBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null

  const { system, userMessage } = buildStoryAnalyzerPrompt({
    narration: story.body,
    channelCanon,
    nicheDescription: channel.nicheDescription ?? '',
    era: worldBible.era,
    regionDescriptor: worldBible.region,
    presentation: channel.presentation, // owner-set embodiment hint (bias, not command)
  })

  // channelCanon is in the hash so a channel-canon change re-derives the bible; narration covers story
  // edits; presentation is in it so changing the hint re-derives the bible (the hint steers perspective).
  const inputHash = buildInputHash(STORY_ANALYZER_V1_VERSION, {
    narration: story.body,
    channelCanon,
    presentation: channel.presentation,
    sourcePolicy,
    identityStateCriticVersion: IDENTITY_STATE_CRITIC_V1_VERSION,
  })

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
        const requiredStateIds = new Map<string, Set<string>>()

        // Prompt guidance alone missed Crossroads' load-bearing transformation twice. Judge the extracted
        // Bible explicitly before scene planning; a failure buys one targeted analyzer repair, still inside
        // this runStep so every paid token reaches the reel exactly once.
        if (allowsRealWorldEntityPlates(sourcePolicy) && analyzed.entities.length > 0) {
          const statePrompt = buildIdentityStateCriticPrompt({
            narration: story.body,
            bibleJson: JSON.stringify(analyzed, null, 2),
          })
          const stateVerdict = await llmCall({
            templateVersion: IDENTITY_STATE_CRITIC_V1_VERSION,
            schema: IdentityStateCriticSchema,
            provider: 'anthropic',
            system: statePrompt.system,
            messages: [{ role: 'user', content: statePrompt.userMessage }],
            maxTokens: 1800,
          })
          cost += stateVerdict.costCents
          const stateIssues = stateVerdict.data.issues ?? []
          console.log(
            `[identity-state-gate] ${reelId.slice(0, 8)}: ${stateVerdict.data.ok && stateIssues.length === 0 ? 'pass' : `${stateIssues.length} issue(s)`}`,
          )
          if (!stateVerdict.data.ok || stateIssues.length > 0) {
            for (const issue of stateIssues) {
              requiredStateIds.set(issue.entityId, new Set(issue.requiredStateIds ?? []))
            }
            const issues = stateIssues.map(
              (issue) => `${issue.entityId}: ${issue.reason} Boundary: ${issue.boundaryEvidence}. Required states: ${(issue.requiredStateIds ?? []).join(', ') || 'judge from narration'}.`,
            )
            const repair = await llmCall({
              templateVersion: STORY_ANALYZER_V1_VERSION,
              schema: StoryBibleSchema,
              system,
              messages: [
                { role: 'user', content: userMessage },
                { role: 'assistant', content: JSON.stringify(analyzed) },
                { role: 'user', content: `Repair these missing visual identity states, then return the corrected FULL Story Bible JSON only:\n- ${issues.join('\n- ')}\nKeep each subject as one entity, add only narration-supported appearances, split journey spans at the exact visible state boundary, and bind the correct state. Preserve all other correct entities and facts.` },
              ],
              maxTokens: analyzerMaxTokens,
            })
            cost += repair.costCents
            analyzed = StoryBibleSchema.parse(repair.data)
          }
        }

        // Journey transition validation → ONE repair round (mirrors the breakdown's repair). Catches the
        // narrator "teleporting" between enclosed spaces with no movement leg. Conservative — usually no-op.
        const journeyIssues = [
          ...validateJourneyTiling(story.body, analyzed.continuity.journey),
          ...validateJourneyTransitions(analyzed.continuity.journey),
          ...validateAppearanceBindings(analyzed),
        ]
        if (journeyIssues.length > 0) {
          console.warn(`[analyze-story] ${reelId.slice(0, 8)} journey has ${journeyIssues.length} transition issue(s) → repair`)
          const repair = await llmCall({
            templateVersion: STORY_ANALYZER_V1_VERSION,
            schema: StoryBibleSchema,
            system,
            messages: [
              { role: 'user', content: userMessage },
              // Repair the CURRENT state-enriched bible, not the analyzer's original output. Feeding the
              // original here erased the state doctor's work on Crossroads in the very next round.
              { role: 'assistant', content: JSON.stringify(analyzed) },
              { role: 'user', content: `Fix these journey continuity or identity-state binding problems, then return the corrected FULL JSON only:\n- ${journeyIssues.join('\n- ')}\nKeep every journey span verbatim and preserve all correct entities, appearances, and legs.` },
            ],
            maxTokens: analyzerMaxTokens,
          })
          cost += repair.costCents
          analyzed = StoryBibleSchema.parse(repair.data)
        }

        // A later journey repair must not erase a state the identity audit just made load-bearing. Enforce
        // the critic's typed requirement after every analyzer repair, before routing or image work.
        for (const [entityId, states] of requiredStateIds) {
          const entity = analyzed.entities.find((candidate) => candidate.id === entityId)
          const actual = new Set((entity?.appearances ?? []).map((appearance) => appearance.id))
          const missing = states.size > 0
            ? [...states].filter((stateId) => !actual.has(stateId))
            : actual.size > 0 ? [] : ['a narration-supported non-default state']
          if (!entity || missing.length > 0) {
            throw new IdentityStateGateError(
              `Identity state repair did not persist for "${entityId}" (missing: ${missing.join(', ')}).`,
            )
          }
        }

        // Resolve the final bible: channel canon + this story's extraction (analyzer wins on shared ids).
        bible = mergeBible(channelCanon, analyzed)
      } catch (err) {
        if (err instanceof IdentityStateGateError) throw err
        console.warn(`[analyze-story] ${reelId.slice(0, 8)} analysis failed, persisting canon-only bible: ${err instanceof Error ? err.message : String(err)}`)
        bible = mergeBible(channelCanon, EMPTY_STORY_BIBLE)
      }
      // Carry forward any operator-locked entities (and their plates) so a re-derive can't clobber edits.
      bible = preserveLockedEntities(bible, priorBible)

      // Resolve source/depiction status BEFORE the director plans scenes. This remains text-only: no image is
      // searched or downloaded here, so the storyboard gate stays cheap. The director can now distinguish a
      // verified real identity from a generic precursor and bind the exact entity/state deliberately. These
      // paid classification calls live inside analyze_story's runStep and are returned in its one cost total.
      const unrouted = bible.entities.filter((entity) => !entity.depiction)
      if (unrouted.length > 0) {
        const routed = await Promise.all(
          unrouted.map(async (entity) => ({
            entity,
            result: await routeDepiction(entity, sourcePolicy, worldBible.region),
          })),
        )
        for (const { entity, result: routedEntity } of routed) {
          entity.depiction = routedEntity.routing
          cost += routedEntity.costCents
        }
      }
      return { output: bible, costCents: cost }
    },
  )

  await db.update(reels).set({ storyBible: result.output }).where(eq(reels.id, reelId))
}
