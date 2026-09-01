// identity-state-critic.v1 — checks whether the Story Bible exposes every narration-supported visual state
// needed to keep one real identity continuous through a transformation. Judgment-shaped by necessity: noun
// matching cannot distinguish an ordinary precursor from a titled artwork of the same category.
import { z } from 'zod'

export const IDENTITY_STATE_CRITIC_V1_VERSION = 'identity-state-critic.v1.2'

export const IdentityStateCriticSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({
    entityId: z.string(),
    reason: z.string(),
    boundaryEvidence: z.string(),
    requiredStateIds: z.array(z.string()).default([]),
  })).default([]),
})

export function buildIdentityStateCriticPrompt(args: {
  narration: string
  bibleJson: string
}): { system: string; userMessage: string } {
  const system = `You audit a factual Story Bible for VISUAL IDENTITY STATE COMPLETENESS before storyboarding.

Find only load-bearing cases where the narration visibly depicts the SAME specific identity in materially different states over time: before/after modification, damage/restoration, construction/demolition, youth/old age, disguise/reveal, or another persistent change. A state is needed when using one frozen description/reference everywhere would put details from the wrong moment into a shot.

Rules:
- Identity stays one entity. Different states belong in that entity's appearances; they are never separate entities.
- Each appearance is a complete visual description preserving stable identity/geometry and changing only narration-supported details.
- The journey must split at the exact clause where the visible state changes and bind the non-default state there.
- A transformation described as an action sequence COUNTS even when it happens inside one sentence: the
  subject visibly exists before the modifying action and after it. When that transformation is central to
  the story, a Bible that stores only the final state and no appearance is incomplete. Example pattern:
  acquired upright and unmarked → rotated and signed. Require the precursor state and its clause boundary.
- Canonical failure to catch: the narration says an object was bought/acquired/selected, then turned,
  rotated, marked, signed, damaged, restored, or otherwise visibly changed; the Bible's base description
  contains only the final details and its appearances array is absent/empty. This MUST fail when the transformation
  is part of what the story explains, even if the precursor lasts for only one clause.
- Do not demand states for camera angle, lighting, mood, temporary action/pose, a merely held prop, or a subject that is never visibly shown in more than one relevant state.
- Do not invent a transformation. When evidence is ambiguous, pass.

You diagnose only. Return concise issues the analyzer can repair; never rewrite the Bible yourself.`

  const userMessage = `NARRATION:
"""${args.narration}"""

CURRENT STORY BIBLE:
${args.bibleJson}

Return JSON: { "ok": boolean, "issues": [{ "entityId": string, "reason": string, "boundaryEvidence": string, "requiredStateIds": [string] }] }`
  return { system, userMessage }
}
