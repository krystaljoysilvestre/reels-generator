// story-ebn-fidelity.v1 — the Fact-Fidelity Checker (FFC) for Evidence-Based Narrative. It compares a
// NARRATION against the Evidence Bible and flags ONLY factual-fidelity problems; it ignores prose
// quality entirely (that is the Narrative-Quality Checker's job). See specs/evidence-based-narrative.md.
// Validated as a probe (caught 6/6 injected violations; passed clean narration). Versioned source.
import { z } from 'zod'
import type { EbnFact } from './story-ebn-extractor.v1.js'

export const STORY_EBN_FIDELITY_V1_VERSION = 'story-ebn-fidelity.v1.0'

export const EbnFidelitySchema = z.object({
  issues: z.array(
    z.object({
      axis: z.enum(['added', 'removed', 'attribution', 'certainty', 'chronology', 'dialogue', 'motive']),
      offending: z.string(), // exact quote from the narration
      detail: z.string(), // why it violates fidelity
    }),
  ),
  summary: z.string().default(''),
})
export type EbnFidelityVerdict = z.infer<typeof EbnFidelitySchema>

export interface EbnFidelityVars {
  facts: Pick<EbnFact, 'id' | 'stance' | 'weight' | 'value' | 'attributed_to'>[]
  criticalIds: string[]
  narration: string
}

export function buildEbnFidelityPrompt(v: EbnFidelityVars): { system: string; userMessage: string } {
  const system = `You are the FACT-FIDELITY CHECKER for an Evidence-Based Narrative. Compare a NARRATION against the EVIDENCE BIBLE and flag ONLY factual-fidelity problems. IGNORE prose quality entirely.
For each problem: name the axis and quote the offending text. Axes:
- added: a claim/detail/name/number/place asserted that NO fact supports.
- removed: a CRITICAL fact absent from the narration.
- attribution: a fact whose stance is CLAIM stated WITHOUT its attribution (as if settled).
- certainty: a stance upgraded — a CLAIM/LIKELY/DISPUTED/UNKNOWN rendered as settled FACT, or "believed"→"knew".
- chronology: the ACTUAL sequence of events distorted (presentation order is allowed; real order is not).
- dialogue: quoted speech that is not in the evidence.
- motive: a reason/intent/emotion asserted that no fact supports.
Be strict and literal: every asserted fact must trace to the Bible. If the narration is fully faithful, return an empty issues array.`

  const userMessage = `EVIDENCE BIBLE:\n${JSON.stringify(v.facts, null, 2)}\n\nCRITICAL fact ids: ${v.criticalIds.join(', ')}\n\nNARRATION:\n${v.narration}\n\nList all fidelity issues. OUTPUT (JSON only; empty issues array if fully faithful):\n{ "issues": [ { "axis": "added", "offending": "<exact quote>", "detail": "<why>" } ], "summary": "" }`

  return { system, userMessage }
}
