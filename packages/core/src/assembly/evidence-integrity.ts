// Deterministic provenance checks at the existing evidence pipeline boundaries.
// These verify references, not whether a factual claim is true (the fidelity judge owns that).
import type { EbnFact } from '../prompts/story-ebn-extractor.v1.js'
import type { EbnClaims } from '../prompts/story-ebn-planner.v1.js'
import type { EbnWriter } from '../prompts/story-ebn-writer.v1.js'

export const EVIDENCE_INTEGRITY_VERSION = 'evidence-integrity.v1'

function assertNoIssues(issues: string[]): void {
  if (issues.length) throw new Error(`Evidence integrity failed: ${issues.slice(0, 12).join('; ')}${issues.length > 12 ? `; ${issues.length - 12} more issues` : ''}`)
}

function uniqueIds(items: { id: string }[], label: string, issues: string[]): Set<string> {
  const ids = new Set<string>()
  for (const item of items) {
    if (!item.id.trim()) issues.push(`${label} has an empty id`)
    if (ids.has(item.id)) issues.push(`duplicate ${label} id ${item.id}`)
    ids.add(item.id)
  }
  return ids
}

export function assertEvidenceBibleIntegrity(facts: EbnFact[]): void {
  const issues: string[] = []
  if (!facts.length) issues.push('the Evidence Bible is empty')
  const ids = uniqueIds(facts, 'fact', issues)
  for (const fact of facts) {
    if (!fact.value.trim()) issues.push(`fact ${fact.id} has no text`)
    for (const parent of fact.derived_from ?? []) {
      if (!ids.has(parent)) issues.push(`fact ${fact.id} derives from unknown fact ${parent}`)
      if (parent === fact.id) issues.push(`fact ${fact.id} derives from itself`)
    }
    if (fact.kind === 'DERIVED' && !fact.derived_from?.length) issues.push(`derived fact ${fact.id} has no parent facts`)
  }
  // A chain of derivations must terminate in source facts, never justify itself through a cycle.
  const byId = new Map(facts.map(f => [f.id, f]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) { issues.push(`cyclic derivation at fact ${id}`); return }
    if (visited.has(id)) return
    visiting.add(id)
    for (const parent of byId.get(id)?.derived_from ?? []) if (byId.has(parent)) visit(parent)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id)
  assertNoIssues(issues)
}

export function assertEbnClaimsIntegrity(facts: EbnFact[], claims: EbnClaims['claims']): void {
  assertEvidenceBibleIntegrity(facts)
  const issues: string[] = []
  if (!claims.length) issues.push('the narrative has no claims')
  uniqueIds(claims, 'claim', issues)
  const factIds = new Set(facts.map(f => f.id))
  const covered = new Set<string>()
  const orders = new Set<number>()
  for (const claim of claims) {
    if (!Number.isInteger(claim.order) || claim.order < 1 || orders.has(claim.order)) issues.push(`claim ${claim.id} has an invalid or duplicate order`)
    orders.add(claim.order)
    if (!claim.evidence.length) issues.push(`claim ${claim.id} has no evidence`)
    for (const id of claim.evidence) {
      if (!factIds.has(id)) issues.push(`claim ${claim.id} cites unknown fact ${id}`)
      covered.add(id)
    }
  }
  for (const fact of facts) if (fact.weight === 'Critical' && !covered.has(fact.id)) issues.push(`critical fact ${fact.id} is not covered by any claim`)
  assertNoIssues(issues)
}

export function assertEbnCitationIntegrity(facts: EbnFact[], claims: EbnClaims['claims'], draft: EbnWriter): void {
  assertEbnClaimsIntegrity(facts, claims)
  const issues: string[] = []
  const byClaim = new Map(claims.map(c => [c.id, new Set(c.evidence)]))
  const factIds = new Set(facts.map(f => f.id))
  const usedClaims = new Set<string>()
  const cited = new Set<string>()
  if (!draft.narrative.length) issues.push('the cited narration is empty')
  for (const group of draft.narrative) {
    const allowed = byClaim.get(group.claimId)
    if (!allowed) issues.push(`narration refers to unknown claim ${group.claimId}`)
    if (usedClaims.has(group.claimId)) issues.push(`duplicate narration claim ${group.claimId}`)
    usedClaims.add(group.claimId)
    if (!group.sentences.length) issues.push(`claim ${group.claimId} has no narration`)
    for (const sentence of group.sentences) {
      if (!sentence.text.trim()) issues.push(`claim ${group.claimId} contains an empty sentence`)
      if (!sentence.factIds.length) issues.push(`sentence in ${group.claimId} has no citations`)
      for (const id of sentence.factIds) {
        if (!factIds.has(id)) issues.push(`sentence cites unknown fact ${id}`)
        else if (allowed && !allowed.has(id)) issues.push(`fact ${id} is outside claim ${group.claimId}`)
        cited.add(id)
      }
    }
  }
  for (const claim of claims) if (!usedClaims.has(claim.id)) issues.push(`claim ${claim.id} has no narrated passage`)
  for (const fact of facts) if (fact.weight === 'Critical' && !cited.has(fact.id)) issues.push(`critical fact ${fact.id} has no sentence citation`)
  assertNoIssues(issues)
}

/** A ceiling on planning granularity, never a minimum number of claims the story must invent. */
export function ebnClaimBudget(targetWords: number): number {
  if (!Number.isFinite(targetWords) || targetWords <= 0) throw new Error('Evidence narrative needs a positive word budget')
  return Math.max(1, Math.ceil(targetWords / 28))
}

/** Both attempts target the SAME production budget; only the corrective action changes. */
export function ebnLengthCorrection(targetWords: number, actualWords: number): {
  direction: 'expand' | 'compress'; requestedWords: number; instruction: string
} {
  ebnClaimBudget(targetWords)
  const direction = actualWords < Math.round(targetWords * 0.9) ? 'expand' : 'compress'
  const instruction = direction === 'expand'
    ? `The previous draft was ${actualWords} words. Expand supported explanation and context toward ${targetWords} words (allowed ${Math.round(targetWords * 0.9)}–${Math.round(targetWords * 1.1)}). Use only the supplied evidence, preserve certainty and citations, and do not invent details or pad with repetition. If the evidence cannot support the requested length, preserve fidelity rather than fabricating content.`
    : `The previous draft was ${actualWords} words. Compress redundant wording and combine supported ideas toward ${targetWords} words (allowed ${Math.round(targetWords * 0.9)}–${Math.round(targetWords * 1.1)}). Preserve the critical facts, claim coverage, certainty, and sentence citations.`
  return { direction, requestedWords: targetWords, instruction }
}
