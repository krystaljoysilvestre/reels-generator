import { describe, expect, it } from 'vitest'
import { buildEntityBindingCriticPrompt, reconcileVerifiedIdentityBindings, tagVerifiedAppearanceBindings, verifiedIdentityBindingsMatch } from './entity-binding-critic.v1.js'

describe('entity binding critic prompt', () => {
  it('distinguishes an exact identity state from a generic precursor without prescribing style', () => {
    const prompt = buildEntityBindingCriticPrompt({
      entities: [{
        id: 'duchamp-fountain',
        description: 'the signed readymade rotated onto its back',
        requiresVerifiedBinding: true,
        appearances: [{ id: 'unsigned-upright', description: 'the same fixture upright and unmarked' }],
      }],
      scenes: [{
        idx: 1,
        narrationText: 'He looked through rows of ordinary urinals.',
        imagePrompt: 'Rows of plumbing fixtures in a shop window.',
      }],
    })
    expect(prompt.system).toContain('generic member of the same category')
    expect(prompt.system).toContain('select the exact appearance state')
    expect(prompt.system).toContain('Classify ONLY entries with requiresVerifiedBinding=true')
    expect(prompt.system).toContain('cannot be biased by existing tags')
    expect(prompt.system).toContain('photograph, printed page, screen, comparison, reconstruction')
    expect(prompt.system).toContain('A conceptual presentation is not permission to substitute a generic look')
    expect(prompt.system).toContain('Camera, composition, lighting, visual style')
    expect(prompt.userMessage).toContain('unsigned-upright')
  })

  it('repairs only audited identity tags while preserving the director\'s other entities', () => {
    expect(reconcileVerifiedIdentityBindings({
      primaryEntity: 'marcel-duchamp',
      supportingEntities: ['wrong-fountain-tag', 'duchamp-fountain'],
      appearanceByEntity: { 'duchamp-fountain': 'archival_only', 'marcel-duchamp': 'profile' },
    }, ['duchamp-fountain'], [{ entityId: 'duchamp-fountain', stateId: 'unsigned-upright' }])).toEqual({
      primaryEntity: 'marcel-duchamp',
      supportingEntities: ['wrong-fountain-tag', 'duchamp-fountain'],
      appearanceByEntity: { 'marcel-duchamp': 'profile', 'duchamp-fountain': 'unsigned-upright' },
    })
  })

  it('turns a verified appearance selection into a complete source-bearing entity tag', () => {
    expect(tagVerifiedAppearanceBindings({
      primaryEntity: 'marcel-duchamp',
      supportingEntities: [],
      appearanceByEntity: { 'duchamp-fountain': 'unsigned-upright' },
    }, ['duchamp-fountain'])).toMatchObject({
      primaryEntity: 'marcel-duchamp',
      supportingEntities: ['duchamp-fountain'],
    })
  })

  it('does not trust a verdict whose depicted list disagrees with the scene tags', () => {
    expect(verifiedIdentityBindingsMatch({
      primaryEntity: null,
      supportingEntities: [],
      appearanceByEntity: {},
    }, ['duchamp-fountain'], [{ entityId: 'duchamp-fountain', stateId: null }])).toBe(false)
    expect(verifiedIdentityBindingsMatch({
      primaryEntity: 'duchamp-fountain',
      supportingEntities: [],
      appearanceByEntity: { 'duchamp-fountain': 'modified' },
    }, ['duchamp-fountain'], [{ entityId: 'duchamp-fountain', stateId: 'modified' }])).toBe(true)
  })
})
