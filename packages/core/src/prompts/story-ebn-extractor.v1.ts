// story-ebn-extractor.v1 — the Evidence Extractor for Evidence-Based Narrative (see
// specs/evidence-based-narrative.md). Turns a human-curated DOSSIER (labeled source material) into a
// frozen table of ATOMIC FACTS. It is the ONE stage that reads sources; everything downstream only
// transforms this table. It owns the shared Evidence Bible schema.
//
// The extractor is itself a fidelity risk (extraction-time invention is a real failure mode — see the
// documentary probe), so its contract is strict: extract ONLY what the dossier states, and assign the
// truth-stance by how the dossier frames each fact (a court finding is FACT; an allegation is a CLAIM).
// Validated as a probe (apps/worker/scripts/probe-ebn.ts). Versioned source; bump on any prompt edit.
import { z } from 'zod'

export const STORY_EBN_EXTRACTOR_V1_VERSION = 'story-ebn-extractor.v1.0'

export const EbnStance = z.enum(['FACT', 'LIKELY', 'CLAIM', 'DISPUTED', 'UNKNOWN'])
export const EbnWeight = z.enum(['Critical', 'High', 'Medium', 'Background'])

export const EbnFactSchema = z.object({
  id: z.string(), // F01, F02, …
  kind: z.enum(['DIRECT', 'DERIVED']),
  value: z.string(),
  stance: EbnStance,
  weight: EbnWeight,
  source: z.array(z.string()).default([]),
  attributed_to: z.string().optional(), // required in spirit when stance === 'CLAIM'
  derived_from: z.array(z.string()).default([]), // fact ids, when kind === 'DERIVED'
})
export type EbnFact = z.infer<typeof EbnFactSchema>

export const EvidenceBibleSchema = z.object({ facts: z.array(EbnFactSchema) })
export type EvidenceBible = z.infer<typeof EvidenceBibleSchema>

export interface EbnExtractorVars {
  dossier: string // curated source material, ideally with source labels (COURT VERDICT: …, POLICE REPORT: …)
  subject?: string // one-line note on what this dossier is about (optional)
}

export function buildEbnExtractorPrompt(v: EbnExtractorVars): { system: string; userMessage: string } {
  const system = `You are the EVIDENCE EXTRACTOR for an Evidence-Based Narrative. You are given a curated DOSSIER — source material a human assembled. Extract it into a frozen table of ATOMIC FACTS. This table becomes the ONLY source of truth downstream, so precision matters more than coverage.

RULES:
- Extract ONLY what the dossier states. Invent NOTHING — no fact, name, number, date, place, motive, or quote that is not in the dossier.
- One atomic fact per row. Give each an id (F01, F02, …).
- kind: DIRECT (stated in a source) or DERIVED (mechanically inferable from other facts — e.g. a duration from an entry and an exit time). A DERIVED fact must list its derived_from fact ids and be conservative; if it is not strictly inferable, do not create it.
- stance — assign by HOW THE DOSSIER FRAMES IT, never by your own belief:
  • FACT = a court finding/verdict/record, or something stated plainly by an authoritative source.
  • CLAIM = something a party alleged/believed/claimed (set attributed_to to that party). NEVER promote an allegation to FACT.
  • DISPUTED = sources disagree, or a claim the record explicitly rejects/contests.
  • UNKNOWN = the dossier explicitly says it is unresolved/not established.
  • LIKELY = supported but hedged (e.g. multiple sources agree but not adjudicated).
- weight: Critical (the spine — who, what happened, the verdict, the central finding), High, Medium, or Background (incidental colour).
- source: the labeled source(s) from the dossier for that fact.
Do NOT summarize the dossier into prose. Output the fact table only.`

  const userMessage = `DOSSIER${v.subject ? ` (subject: ${v.subject})` : ''}:\n${v.dossier}\n\nExtract the atomic-fact table. OUTPUT (JSON only):\n{ "facts": [ { "id": "F01", "kind": "DIRECT", "value": "", "stance": "FACT", "weight": "Critical", "source": [""], "attributed_to": "", "derived_from": [] } ] }`

  return { system, userMessage }
}
