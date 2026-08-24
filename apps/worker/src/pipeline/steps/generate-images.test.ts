import { describe, expect, it } from 'vitest'
import { SourcePolicySchema } from '@reels/core'
import { buildStateAdaptationPrompt, requiresVisualTruthQa, sourceQueryCandidates } from './generate-images.js'

describe('requiresVisualTruthQa', () => {
  it('enrolls evidence-required reels independently of creative genre', () => {
    const policy = SourcePolicySchema.parse({ evidenceRequired: true, invention: 'constrained' })

    expect(requiresVisualTruthQa(policy, 'general')).toBe(true)
    expect(requiresVisualTruthQa(policy, 'commentary')).toBe(true)
    expect(requiresVisualTruthQa(policy, 'horror')).toBe(true)
  })

  it('preserves informational enrollment without truth-gating ordinary fiction', () => {
    const fictional = SourcePolicySchema.parse({})

    expect(requiresVisualTruthQa(fictional, 'informational')).toBe(true)
    expect(requiresVisualTruthQa(fictional, 'horror')).toBe(false)
  })
})

describe('sourceQueryCandidates', () => {
  it('tries alternate identity-led queries for a non-human subject', () => {
    expect(sourceQueryCandidates({
      id: 'the-blind-man-magazine',
      description: 'May 1917 issue featuring Fountain',
    }, { query: 'The Blind Man May 1917 Fountain', subjectClass: 'object' })).toEqual([
      'The Blind Man May 1917 Fountain',
      'The Blind Man Magazine',
      'The Blind Man Magazine May 1917 issue featuring Fountain',
    ])
  })

  it('adds a compact exact-title query before broadening to the entity name', () => {
    expect(sourceQueryCandidates({
      id: 'the-blind-man-magazine',
      description: 'the May 1917 issue featuring Fountain',
    }, { query: 'The Blind Man magazine May 1917 issue Fountain', subjectClass: 'object' })).toEqual([
      'The Blind Man magazine May 1917 issue Fountain',
      'The Blind Man May 1917 Fountain',
      'The Blind Man Magazine',
      'The Blind Man Magazine the May 1917 issue featuring Fountain',
    ])
  })

  it('does not broaden human identity searches', () => {
    expect(sourceQueryCandidates({ id: 'marcel-duchamp', description: 'artist' }, {
      query: 'Marcel Duchamp photograph', subjectClass: 'human',
    })).toEqual(['Marcel Duchamp photograph'])
  })

  it('locks source geometry and required state details during adaptation', () => {
    const prompt = buildStateAdaptationPrompt('documentary reference plate', "turned on its back, marked 'R. Mutt 1917'")
    expect(prompt).toContain('Preserve the source subject\'s exact physical geometry')
    expect(prompt).toContain("marked 'R. Mutt 1917'")
    expect(prompt).toContain('TARGET STATE IS AUTHORITATIVE')
    expect(prompt).toContain('must not carry over')
  })

  it('does not universally preserve a mark that the target state says is absent', () => {
    const prompt = buildStateAdaptationPrompt('documentary reference plate', 'an upright, unmarked porcelain urinal')
    expect(prompt).toContain('surface markings')
    expect(prompt).toContain('an upright, unmarked porcelain urinal')
    expect(prompt).not.toContain('Do not omit')
  })
})
