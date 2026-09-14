import { describe, expect, it } from 'vitest'
import { EvidenceBibleSchema } from '../prompts/story-ebn-extractor.v1.js'
import type { EbnWriter } from '../prompts/story-ebn-writer.v1.js'
import { assertEvidenceBibleIntegrity, assertEbnClaimsIntegrity, assertEbnCitationIntegrity, ebnClaimBudget, ebnLengthCorrection } from './evidence-integrity.js'

const facts = EvidenceBibleSchema.parse({ facts: [
  { id: 'F1', kind: 'DIRECT', value: 'The board voted against the proposal.', stance: 'FACT', weight: 'Critical', source: ['Minutes'] },
  { id: 'F2', kind: 'DIRECT', value: 'The proposal was discussed on Monday.', stance: 'FACT', weight: 'Background', source: ['Minutes'] },
] }).facts
const claims = [{ id: 'C1', order: 1, purpose: 'Explain the decision.', evidence: ['F1'] }]
const draft: EbnWriter = { title: 'The decision', logline: 'The board voted.', peakSentence: 'The board voted against the proposal.', narrative: [
  { claimId: 'C1', sentences: [{ text: 'The board voted against the proposal.', factIds: ['F1'] }] },
] }

describe('evidence provenance boundaries', () => {
  it('accepts supported citations without requiring every background fact', () => {
    expect(() => assertEbnCitationIntegrity(facts, claims, draft)).not.toThrow()
  })

  it('rejects duplicate fact ids before their map can silently overwrite evidence', () => {
    expect(() => assertEvidenceBibleIntegrity([...facts, facts[0]!])).toThrow('duplicate fact id F1')
  })

  it('rejects unknown and cyclic derivation references', () => {
    expect(() => assertEvidenceBibleIntegrity([{ ...facts[0]!, kind: 'DERIVED', derived_from: ['missing'] }])).toThrow('unknown fact missing')
    expect(() => assertEvidenceBibleIntegrity([
      { ...facts[0]!, kind: 'DERIVED', derived_from: ['F2'] },
      { ...facts[1]!, kind: 'DERIVED', derived_from: ['F1'] },
    ])).toThrow('cyclic derivation')
  })

  it('rejects unsupported claims before writing rather than filtering their references away', () => {
    expect(() => assertEbnClaimsIntegrity(facts, [{ ...claims[0]!, evidence: ['missing'] }])).toThrow('unknown fact missing')
    expect(() => assertEbnClaimsIntegrity(facts, [{ ...claims[0]!, evidence: [] }])).toThrow('has no evidence')
  })

  it('rejects omitted critical facts, duplicate claim ids and ambiguous ordering', () => {
    expect(() => assertEbnClaimsIntegrity(facts, [{ ...claims[0]!, evidence: ['F2'] }])).toThrow('critical fact F1')
    expect(() => assertEbnClaimsIntegrity(facts, [claims[0]!, claims[0]!])).toThrow('duplicate claim id')
    expect(() => assertEbnClaimsIntegrity(facts, [{ ...claims[0]!, order: 0 }])).toThrow('invalid or duplicate order')
  })

  it.each([
    { citations: [], expected: 'has no citations' },
    { citations: ['missing'], expected: 'unknown fact missing' },
    { citations: ['F2'], expected: 'outside claim C1' },
  ])('rejects invalid sentence support: $expected', ({ citations, expected }) => {
    const candidate = structuredClone(draft)
    candidate.narrative[0]!.sentences[0]!.factIds = citations
    expect(() => assertEbnCitationIntegrity(facts, claims, candidate)).toThrow(expected)
  })

  it('rejects a supported sentence assigned to an unknown claim', () => {
    const candidate = structuredClone(draft)
    candidate.narrative[0]!.claimId = 'C404'
    expect(() => assertEbnCitationIntegrity(facts, claims, candidate)).toThrow('unknown claim C404')
  })

  it('requires narrated claim coverage and critical sentence support, not just a valid plan', () => {
    const twoClaims = [...claims, { id: 'C2', order: 2, purpose: 'Give the date.', evidence: ['F2'] }]
    expect(() => assertEbnCitationIntegrity(facts, twoClaims, draft)).toThrow('claim C2 has no narrated passage')
    const candidate = structuredClone(draft)
    candidate.narrative[0]!.sentences[0]!.factIds = ['F2']
    expect(() => assertEbnCitationIntegrity(facts, [{ ...claims[0]!, evidence: ['F1', 'F2'] }], candidate)).toThrow('critical fact F1 has no sentence citation')
  })
})

describe('evidence duration budgets', () => {
  it('allows long-form planning to grow without forcing a minimum claim count', () => {
    expect(ebnClaimBudget(20)).toBe(1)
    expect(ebnClaimBudget(750)).toBeGreaterThan(14)
    expect(ebnClaimBudget(3000)).toBeGreaterThan(ebnClaimBudget(750))
  })

  it.each([50, 200, 750, 3000])('keeps the actual %i-word target for short and long corrections', target => {
    const short = ebnLengthCorrection(target, Math.round(target * 0.5))
    const long = ebnLengthCorrection(target, target * 2)
    expect(short.direction).toBe('expand')
    expect(long.direction).toBe('compress')
    expect(short.requestedWords).toBe(target)
    expect(long.requestedWords).toBe(target)
    expect(short.instruction).toContain(`${Math.round(target * 0.9)}–${Math.round(target * 1.1)}`)
  })
})
