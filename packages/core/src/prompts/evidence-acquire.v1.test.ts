import { describe, expect, it } from 'vitest'
import {
  buildEvidenceAcquirePrompt,
  EVIDENCE_ACQUIRE_V1_VERSION,
  EVIDENCE_MAX_FACTS,
  EVIDENCE_MAX_FACT_WORDS,
  EVIDENCE_MAX_SOURCES,
  EvidenceAcquireSchema,
  renderDossier,
} from './evidence-acquire.v1.js'

const fact = { fact: 'A sourced fact.', date: '1982-10-05', source: 'FDA' }
const source = { title: 'Source title', url: 'https://example.com/source', outlet: 'FDA' }

describe('evidence acquisition output bounds', () => {
  it('accepts the documented maxima and rejects larger arrays', () => {
    expect(EvidenceAcquireSchema.safeParse({
      sufficient: true,
      dossier: Array.from({ length: EVIDENCE_MAX_FACTS }, () => fact),
      sources: Array.from({ length: EVIDENCE_MAX_SOURCES }, () => source),
      reason: '',
    }).success).toBe(true)

    expect(EvidenceAcquireSchema.safeParse({
      sufficient: true,
      dossier: Array.from({ length: EVIDENCE_MAX_FACTS + 1 }, () => fact),
      sources: [source],
      reason: '',
    }).success).toBe(false)

    expect(EvidenceAcquireSchema.safeParse({
      sufficient: true,
      dossier: [fact],
      sources: Array.from({ length: EVIDENCE_MAX_SOURCES + 1 }, () => source),
      reason: '',
    }).success).toBe(false)
  })

  it('tells the researcher the same ceilings enforced by the schema', () => {
    const prompt = buildEvidenceAcquirePrompt({
      subject: 'A documented decision',
      channelName: 'Crossroads',
      nicheDescription: 'Historical crossroads.',
      language: 'English',
      allowPeople: true,
    })
    const text = `${prompt.system}\n${prompt.userMessage}`
    expect(EVIDENCE_ACQUIRE_V1_VERSION).toBe('evidence-acquire.v1.1')
    expect(text).toContain(`at most ${EVIDENCE_MAX_FACTS}`)
    expect(text).toContain(`at most ${EVIDENCE_MAX_FACT_WORDS} words`)
    expect(text).toContain(`at most ${EVIDENCE_MAX_SOURCES} sources`)
    expect(text).toContain('maximums, not targets')
  })

  it('keeps structured facts attributable when flattened for the reel', () => {
    expect(renderDossier([fact])).toBe('- [1982-10-05] A sourced fact. (FDA)')
  })
})
