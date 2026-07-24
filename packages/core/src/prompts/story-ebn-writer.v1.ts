// story-ebn-writer.v1 — the Writer for Evidence-Based Narrative. It expands NARRATIVE CLAIMS into prose,
// drawing ONLY on the facts each claim cites, under an explicit per-specialization PERMISSIONS contract,
// and emits per-sentence citations (the citability map that makes the Fact-Fidelity Checker a lookup).
// See specs/evidence-based-narrative.md. Validated as a probe. Versioned source; bump on any prompt edit.
import { z } from 'zod'
import type { EbnFact } from './story-ebn-extractor.v1.js'

export const STORY_EBN_WRITER_V1_VERSION = 'story-ebn-writer.v1.1'

// The narrative-permissions contract (per specialization). True Crime's profile is the strict default.
export interface EbnPermissions {
  may_invent_dialogue: boolean
  may_infer_emotions: boolean
  may_invent_motive: boolean
  may_present_out_of_order: boolean
  may_change_actual_chronology: boolean
  may_summarize: boolean
  may_describe_unknowns: boolean
}
export const TRUE_CRIME_PERMISSIONS: EbnPermissions = {
  may_invent_dialogue: false,
  may_infer_emotions: false,
  may_invent_motive: false,
  may_present_out_of_order: true,
  may_change_actual_chronology: false,
  may_summarize: true,
  may_describe_unknowns: true,
}

// Nested: the model naturally groups sentences under each claim. Flatten downstream if a flat list is wanted.
// v1.1 also emits the story-contract fields (title/logline/peakSentence) so the EBN branch can shape a
// StoryOutput without a second LLM call. These stay evidence-bound: title/logline summarize the cited
// facts (assert nothing new), and peakSentence must be copied verbatim from one of the sentences below
// (so the downstream peak resolver finds it as a substring of the narration).
export const EbnWriterSchema = z.object({
  title: z.string().min(1),
  logline: z.string().min(1),
  peakSentence: z.string().min(1),
  narrative: z.array(
    z.object({
      claimId: z.string(),
      sentences: z.array(z.object({ text: z.string(), factIds: z.array(z.string()) })),
    }),
  ),
})
export type EbnWriter = z.infer<typeof EbnWriterSchema>

export interface EbnClaimWithFacts {
  id: string
  order: number
  purpose: string
  facts: Pick<EbnFact, 'id' | 'stance' | 'attributed_to' | 'value'>[]
}
export interface EbnWriterVars {
  claims: EbnClaimWithFacts[]
  permissions: EbnPermissions
}

export function buildEbnWriterPrompt(v: EbnWriterVars): { system: string; userMessage: string } {
  const p = v.permissions
  const perm = (b: boolean) => (b ? 'TRUE' : 'FALSE')
  const system = `You are the WRITER for an Evidence-Based Narrative. You expand NARRATIVE CLAIMS into prose, drawing ONLY on the facts each claim cites.
PERMISSIONS: may_invent_dialogue=${perm(p.may_invent_dialogue)} · may_infer_emotions=${perm(p.may_infer_emotions)} · may_invent_motive=${perm(p.may_invent_motive)} · may_present_out_of_order=${perm(p.may_present_out_of_order)} · may_change_actual_chronology=${perm(p.may_change_actual_chronology)} · may_summarize=${perm(p.may_summarize)} · may_describe_unknowns=${perm(p.may_describe_unknowns)}.
STANCE DISCIPLINE (the line between journalism and fiction):
- A CLAIM stays attributed ("prosecutors alleged…") — NEVER stated as settled fact.
- Never upgrade certainty ("believed/considered" must not become "knew").
- A DISPUTED fact is presented as contested; an UNKNOWN is stated as unresolved — never resolved.
- Assert NO fact, name, number, motive, quote, or emotion that isn't in the cited facts.
- A claim's "purpose" is EDITORIAL guidance for what the passage should accomplish — it is NOT a fact. Never state a purpose as fact, and never attribute an editorial characterization (e.g. "deliberate and sustained misconduct", "the full scope") to the court or any party unless a cited fact says so verbatim.
- Do NOT broaden a fact's scope: if a fact concerns "some" transfers, never write "any"/"all".
Write compelling, clear nonfiction prose. For EVERY sentence, cite the factIds it rests on (a sentence with no supporting fact is not allowed).
Also emit three framing fields, all held to the SAME evidence discipline (they assert nothing not in the cited facts):
- "title": a short, non-sensational title for the piece.
- "logline": one sentence summarizing what the piece covers.
- "peakSentence": the single most pivotal sentence of the narrative — the beat the piece turns on. It MUST be copied VERBATIM from one of the sentences you wrote below (exact same text), so downstream can locate it.`

  const userMessage = `CLAIMS (in order), each with its cited facts:\n${JSON.stringify(v.claims, null, 2)}\n\nExpand each claim (in order) into sentences with citations, and emit title/logline/peakSentence. OUTPUT (JSON only):\n{ "title": "", "logline": "", "peakSentence": "", "narrative": [ { "claimId": "C1", "sentences": [ { "text": "", "factIds": ["F01"] } ] } ] }`

  return { system, userMessage }
}
