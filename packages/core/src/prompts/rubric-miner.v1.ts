// rubric-miner.v1 — bootstrap a channel's taste rubric from the operator's own decisions:
// approved stories (isReference) as positives, rejection reasons+notes as anti-patterns.
// Returns a DRAFT for the operator to edit; nothing is saved without their review.

import { z } from 'zod'

export const RUBRIC_MINER_V1_VERSION = 'rubric-miner.v1'

export const RubricMinerSchema = z.object({
  rubric: z.string().min(1),
})
export type RubricMinerOutput = z.infer<typeof RubricMinerSchema>

export interface RubricMinerVars {
  channelName: string
  nicheDescription: string
  referenceStories: string   // formatted approved stories (title + narration each), may be ''
  rejectionSummary: string   // per-reason counts + operator notes, may be ''
}

export function buildRubricMinerPrompt(v: RubricMinerVars): { system: string; userMessage: string } {
  const system = `You distill an operator's taste into a scoring rubric. A critic will use this rubric to rank competing story drafts for "${v.channelName}" (niche: ${v.nicheDescription}), so every line must be CHECKABLE against a script's text.

Rules:
- Extract patterns, not summaries. From approved stories: what do their hooks, escalation, payoffs, and register concretely do? From rejections: what exact moves must never appear?
- Terse, imperative lines. "The first line names a concrete wrong detail" — not "stories should have engaging openings".
- No vague virtues ("compelling", "well-paced", "high quality") — if a line can't be verified by pointing at the text, cut it.
- 8–15 lines total, grouped under: HOOK / BUILD / PAYOFF / VOICE / NEVER.
- Ground every line in the evidence given. Do not invent preferences the evidence doesn't show.`

  const userMessage = `APPROVED STORIES — the operator chose to publish these:
${v.referenceStories || '(none yet)'}

REJECTIONS — the operator killed drafts for these reasons:
${v.rejectionSummary || '(none yet)'}

Distill this operator's taste into a rubric.

OUTPUT (JSON only):
{
  "rubric": ""    // the full rubric text, grouped HOOK / BUILD / PAYOFF / VOICE / NEVER, newline-separated
}`

  return { system, userMessage }
}
