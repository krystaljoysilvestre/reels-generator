import { describe, expect, it } from 'vitest'
import { buildSceneDepictionCriticPrompt, SceneDepictionVerdictSchema } from './scene-depiction-critic.v1.js'

describe('visual truth depiction gate', () => {
  it('judges event invention, chronology, modality, identity state, and source substitution', () => {
    const prompt = buildSceneDepictionCriticPrompt({
      nicheDescription: 'art history',
      genreCategory: 'informational',
      evidenceFacts: { facts: [{ id: 'F01', value: 'The work was excluded.' }] },
      bibleEntities: [{ id: 'fountain', appearances: [{ id: 'submitted', description: 'rotated and signed' }] }],
      journey: [{ span: 'It was submitted.', appearanceByEntity: { fountain: 'submitted' } }],
      scenes: [{
        idx: 1,
        narrationText: 'It was submitted.',
        imagePrompt: 'An anonymous hand steadies the object against plain packing paper.',
        tier: 'still',
        depictionBasis: 'representative',
        primaryEntity: 'fountain',
        supportingEntities: [],
        sourcePresentationEntity: null,
        appearanceByEntity: { fountain: 'submitted' },
      }],
    })

    expect(prompt.system).toContain('invented_event_record')
    expect(prompt.system).toContain('chronology_leak')
    expect(prompt.system).toContain('modality_collapse')
    expect(prompt.system).toContain('wrong_identity_state')
    expect(prompt.system).toContain('source_should_be_present')
    expect(prompt.system).toContain('The hard gate is honesty, not perfect communication')
    expect(prompt.system).toContain('unsupported_specificity means the frame ADDS')
    expect(prompt.system).toContain('MANDATORY TRUTH CHECKLIST')
    expect(prompt.system).toContain('A generic-looking invented studio is still unsupported')
    expect(prompt.system).toContain('canonical-state appearance source')
    expect(prompt.system).toContain('Never infer source_should_be_present from depictionMode:"archival_only"')
    expect(prompt.system).toContain('If no exact sourceAssetKey is supplied, mark sourceUse not_applicable')
    expect(prompt.userMessage).toContain('basis: representative')
    expect(prompt.userMessage).toContain('The work was excluded.')
  })

  it('requires a blocking truth verdict for every scene', () => {
    expect(SceneDepictionVerdictSchema.safeParse({
      scenes: [{ idx: 1, claim: 'submission', depicted: true, interchangeable: false, reason: '' }],
    }).success).toBe(false)
  })
})
