import { describe, expect, it } from 'vitest'
import { SourcePolicySchema } from '@reels/core'
import { applyDepictionRouting, buildStateAdaptationPrompt, requiresVisualTruthQa, sourceQueryCandidates } from './generate-images.js'

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

  it('locks unchanged source geometry and required state details during adaptation', () => {
    const prompt = buildStateAdaptationPrompt('documentary reference plate', "turned on its back, marked 'R. Mutt 1917'")
    expect(prompt).toContain('Preserve the source subject\'s identity-defining geometry')
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

  it('does not force an explicitly destructive target to remain intact', () => {
    const prompt = buildStateAdaptationPrompt(
      'documentary reference plate',
      'broken apart in mid-air with separated fuselage sections and detached components',
    )
    expect(prompt).toContain('damage, destruction, deformation')
    expect(prompt).toContain('do not keep the subject intact merely to preserve identity')
    expect(prompt).toContain('recognizable subject/model-specific features')
  })
})

describe('applyDepictionRouting', () => {
  it('clears a stale sourced plate when an old exact-identity verdict becomes generated context', () => {
    const entity = {
      id: 'apollo-12',
      kind: 'object' as const,
      description: 'the 1969 lunar mission',
      depiction: {
        subjectClass: 'object' as const,
        depictionMode: 'reference_plate' as const,
        eligibilityReason: 'real_subject' as const,
        query: 'Command module Columbia',
        classifierVersion: 'entity-source.v1.5',
      },
      referenceImageKey: 'reels/reel/refs/apollo-12-source.webp',
      referenceOrigin: { type: 'sourced' as const, sourceAssetKey: 'reels/reel/refs/apollo-12-source.webp' },
      appearances: [{
        id: 'launch',
        description: 'the mission at launch',
        referenceImageKey: 'reels/reel/refs/apollo-12--launch.webp',
        referenceOrigin: { type: 'sourced' as const, sourceAssetKey: 'reels/reel/refs/apollo-12-source.webp' },
      }],
    }

    applyDepictionRouting(entity, {
      subjectClass: 'generic',
      depictionMode: 'generated',
      eligibilityReason: 'generic_subject',
      query: '',
      classifierVersion: 'entity-source.v1.7',
    })

    expect(entity.depiction.depictionMode).toBe('generated')
    expect(entity.referenceImageKey).toBeUndefined()
    expect(entity.referenceOrigin).toBeUndefined()
    expect(entity.appearances[0]!.referenceImageKey).toBeUndefined()
    expect(entity.appearances[0]!.referenceOrigin).toBeUndefined()
  })
})
