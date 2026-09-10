import { describe, expect, it } from 'vitest'
import { SourcePolicySchema } from '@reels/core'
import { applyDepictionRouting, assertSceneImageTruthReady, buildStateAdaptationPrompt, imageTruthNeedsRetry, requiresVisualTruthQa, sourceQueryCandidates, verifiedSourceQueryCandidates } from './generate-images.js'

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

describe('imageTruthNeedsRetry', () => {
  it('reopens only images explicitly enrolled in truth QA that did not pass', () => {
    expect(imageTruthNeedsRetry({ truthQaRequired: true, truthQaPass: false })).toBe(true)
    expect(imageTruthNeedsRetry({ truthQaRequired: true })).toBe(true)
    expect(imageTruthNeedsRetry({ truthQaRequired: true, truthQaPass: true })).toBe(false)
    expect(imageTruthNeedsRetry({ qaPass: false })).toBe(false)
    expect(imageTruthNeedsRetry(null)).toBe(false)
  })
})

describe('assertSceneImageTruthReady', () => {
  it('throws inside the per-scene step for a blocking truth failure', () => {
    expect(() => assertSceneImageTruthReady(3, true, false, ['wrong exact identity']))
      .toThrow('[visual-truth-image-qa] scene 3: wrong exact identity')
  })

  it('does not block ordinary craft QA or a passing factual frame', () => {
    expect(() => assertSceneImageTruthReady(3, false, false, ['craft-only miss'])).not.toThrow()
    expect(() => assertSceneImageTruthReady(3, true, true, [])).not.toThrow()
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

describe('verifiedSourceQueryCandidates', () => {
  it('tries the exact state and parent identity before analyzer shorthand fallbacks', () => {
    const entity = { id: 'thermonuclear-weapon', description: 'a compact cylindrical weapon' }
    const routing = { query: 'Mark 39 nuclear bomb', subjectClass: 'object' as const }
    const candidates = verifiedSourceQueryCandidates(
      entity,
      routing,
      'Mark 39 nuclear bomb parachute deployed',
    )
    const contextualCandidates = verifiedSourceQueryCandidates(
      entity,
      routing,
      'Mark 39 nuclear bomb parachute deployed',
      'Goldsboro, North Carolina',
    )
    expect(contextualCandidates.slice(0, 6)).toEqual([
      'Mark 39 nuclear bomb parachute deployed',
      'Mk 39 nuclear bomb parachute deployed',
      'Mark 39 nuclear bomb Goldsboro, North Carolina',
      'Mk 39 nuclear bomb Goldsboro, North Carolina',
      'Mark 39 nuclear bomb',
      'Mk 39 nuclear bomb',
    ])
    expect(candidates).toContain('Thermonuclear Weapon')
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
