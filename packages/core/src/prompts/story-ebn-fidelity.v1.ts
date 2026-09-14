// story-ebn-fidelity.v1 — the Fact-Fidelity Checker (FFC) for Evidence-Based Narrative. It compares a
// NARRATION against the Evidence Bible and flags ONLY factual-fidelity problems; it ignores prose
// quality entirely (that is the Narrative-Quality Checker's job). See specs/evidence-based-narrative.md.
// Validated as a probe (caught 6/6 injected violations; passed clean narration). Versioned source.
import { z } from 'zod'
import type { EbnFact } from './story-ebn-extractor.v1.js'

export const STORY_EBN_FIDELITY_V1_VERSION = 'story-ebn-fidelity.v1.1'

export const EbnFidelitySchema = z.object({
  issues: z.array(
    z.object({
      axis: z.enum(['added', 'removed', 'attribution', 'certainty', 'chronology', 'dialogue', 'motive', 'citation']),
      surface: z.enum(['narration', 'title', 'logline']).optional(),
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
  title?: string | undefined
  logline?: string | undefined
  citations?: { text: string; factIds: string[]; claimId: string }[] | undefined
}

export function buildEbnFidelityPrompt(v: EbnFidelityVars): { system: string; userMessage: string } {
  const system = `You are the FACT-FIDELITY CHECKER for an Evidence-Based Narrative. Compare the NARRATION and any supplied TITLE and LOGLINE against the EVIDENCE BIBLE and flag ONLY factual-fidelity problems. IGNORE prose quality entirely.
Titles and loglines are factual surfaces too: a careful narration does not excuse a title that invents a fact or presents an allegation as settled. Evaluate each supplied surface on its own assertions. Only the narration must cover every Critical fact; a title or logline may summarize without listing all facts.
For each problem: name the surface and axis and quote the offending text. Axes:
- added: a claim/detail/name/number/place asserted that NO fact supports.
- removed: a CRITICAL fact absent from the narration.
- attribution: a fact whose stance is CLAIM stated WITHOUT its attribution (as if settled).
- certainty: a stance upgraded — a CLAIM/LIKELY/DISPUTED/UNKNOWN rendered as settled FACT, or "believed"→"knew".
- chronology: the ACTUAL sequence of events distorted (presentation order is allowed; real order is not).
- dialogue: quoted speech that is not in the evidence.
- motive: a reason/intent/emotion asserted that no fact supports.
- citation: when a sentence citation map is supplied, the cited facts do not support that sentence's assertions. A fact existing elsewhere in the Bible does not repair a wrong sentence citation. Do not demand sentence citations for title or logline; their assertions are checked against the whole Bible.
Be strict and literal: every asserted fact on every supplied surface must trace to the Bible. If all supplied surfaces are faithful, return an empty issues array.`

  const framing = `${v.title !== undefined ? `\n\nTITLE:\n${v.title}` : ''}${v.logline !== undefined ? `\n\nLOGLINE:\n${v.logline}` : ''}`
  const citations = v.citations ? `\n\nSENTENCE CITATION MAP (verify the support, not just that ids exist):\n${JSON.stringify(v.citations)}` : ''
  const userMessage = `EVIDENCE BIBLE:\n${JSON.stringify(v.facts, null, 2)}\n\nCRITICAL fact ids: ${v.criticalIds.join(', ')}\n\nNARRATION:\n${v.narration}${framing}${citations}\n\nList all fidelity issues. OUTPUT (JSON only; empty issues array if fully faithful):\n{ "issues": [ { "surface": "narration", "axis": "added", "offending": "<exact quote>", "detail": "<why>" } ], "summary": "" }`

  return { system, userMessage }
}
