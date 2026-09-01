// story-ebn-planner.v1 — the Planner for Evidence-Based Narrative. It does NOT emit prose and does NOT
// emit the fiction StoryPlan; it emits NARRATIVE CLAIMS — the compelling ORDERING of verified evidence,
// each claim bound to fact ids. Structure is free (presentation order); facts are not. See
// specs/evidence-based-narrative.md. Validated as a probe. Versioned source; bump on any prompt edit.
import { z } from 'zod'
import type { EbnFact } from './story-ebn-extractor.v1.js'

export const STORY_EBN_PLANNER_V1_VERSION = 'story-ebn-planner.v1.3'

export const EbnClaimsSchema = z.object({
  claims: z.array(
    z.object({
      id: z.string(), // C1, C2, …
      order: z.number(), // 1-based presentation order
      purpose: z.string(), // what this claim accomplishes for the viewer
      evidence: z.array(z.string()), // fact ids it draws on
    }),
  ),
})
export type EbnClaims = z.infer<typeof EbnClaimsSchema>

export interface EbnPlannerVars {
  facts: Pick<EbnFact, 'id' | 'stance' | 'weight' | 'value' | 'attributed_to'>[]
  criticalIds: string[]
  targetNote?: string // e.g. "a ~150-word recap"
  maxClaims?: number
  // Channel promise, requested structure, voice, and operator revision notes. This may shape selection
  // and ordering, but is never evidence and therefore can never introduce a factual claim.
  editorialBrief?: string
}

export function buildEbnPlannerPrompt(v: EbnPlannerVars): { system: string; userMessage: string } {
  const system = `You are the PLANNER for an Evidence-Based Narrative. You are given an EVIDENCE BIBLE: a frozen table of atomic facts, each with an id, a truth stance (FACT/LIKELY/CLAIM/DISPUTED/UNKNOWN) and a weight (Critical/High/Medium/Background).
Your ONLY job is to choose the most compelling ORDERING of these facts into NARRATIVE CLAIMS. Rules:
- Reference facts ONLY by their existing id. Invent NOTHING — add no fact, name, number, motive, or quote.
- Every CRITICAL fact must be covered by at least one claim.
- Each claim has: id (C1, C2, …), order (1-based presentation order), purpose (what it accomplishes for the viewer), and evidence (the fact ids it draws on).
- Treat the requested length as a hard editorial budget. Combine compatible facts into compact claims, cover each Critical fact once unless repetition is essential, and omit non-Critical facts that do not earn space.
- Presentation order is free — you may open on the verdict, flash back, etc. — but the underlying chronology is not yours to change.
- An EDITORIAL BRIEF may specify the channel promise, story shape, voice, or revision feedback. Follow it through fact selection and ordering. It is direction, NEVER evidence: do not turn any factual statement from the brief into a claim unless that statement exists in the Evidence Bible.`

  const editorialBrief = v.editorialBrief?.trim() || 'No additional editorial brief.'
  const claimBudget = v.maxClaims && v.maxClaims > 0 ? ` Use no more than ${Math.round(v.maxClaims)} claims.` : ''
  const userMessage = `EVIDENCE BIBLE:\n${JSON.stringify(v.facts, null, 2)}\n\nCRITICAL fact ids (must all be covered): ${v.criticalIds.join(', ')}\n\nEDITORIAL BRIEF (direction only; never evidence):\n${editorialBrief}\n\nProduce claims for ${v.targetNote ?? 'a compelling recap'}.${claimBudget} OUTPUT (JSON only):\n{ "claims": [ { "id": "C1", "order": 1, "purpose": "", "evidence": ["F01"] } ] }`

  return { system, userMessage }
}
