import { describe, expect, it } from 'vitest'
import { buildEntitySourceDecidePrompt, buildEntityVerifyPrompt, buildIdentityStateVerifyPrompt } from './entity-source.v1.js'

describe('entity source decision', () => {
  it('does not confuse an organization with one of its visual artifacts or buildings', () => {
    const prompt = buildEntitySourceDecidePrompt(
      'character',
      'Society Of Independent Artists',
      'an art collective founded in 1916',
      'New York',
    )
    expect(prompt.system).toContain('organization itself as "generic" and sourceable FALSE')
    expect(prompt.system).toContain('specific document/artifact')
  })

  it('does not misclassify a named historical event as a place', () => {
    const prompt = buildEntitySourceDecidePrompt(
      'location',
      'Society Of Independent Artists Exhibition',
      'the organization\'s first exhibition in 1917',
      'New York',
    )
    expect(prompt.system).toContain('historical event')
    expect(prompt.system).toContain('Never classify an event as a "place"')
  })

  it('does not substitute one vehicle for a named mission', () => {
    const prompt = buildEntitySourceDecidePrompt(
      'object',
      'Apollo 12',
      'the 1969 lunar mission flown by a Saturn V, command module Columbia, and lunar module Intrepid',
    )
    expect(prompt.system).toContain('named mission, operation, expedition')
    expect(prompt.system).toContain('not one physical')
    expect(prompt.system).toContain('Never silently substitute one participant object')
    expect(prompt.system).toContain('separately named physical subject')
  })

  it('lets exact bound narration rescue an analyzer shorthand name', () => {
    const prompt = buildEntitySourceDecidePrompt(
      'object',
      'Thermonuclear Weapon',
      'two compact cylindrical weapons',
      'United States',
      'The second Mark 39 struck the ground and broke apart.',
    )

    expect(prompt.system).toContain('analyzer shorthand')
    expect(prompt.system).toContain('model/designation')
    expect(prompt.system).toContain('exact narration-supported identity wins')
    expect(prompt.userMessage).toContain('BOUND NARRATION EVIDENCE')
    expect(prompt.userMessage).toContain('Mark 39')
  })

  it('treats an exact edition or state as part of object identity', () => {
    const prompt = buildEntityVerifyPrompt('object', 'The Blind Man', 'May 1917 issue featuring Fountain')
    expect(prompt.system).toContain('dated issue, edition, version')
    expect(prompt.system).toContain('different edition/state')
    expect(prompt.system).toContain('internal, hidden, microscopic')
  })

  it('allows a conditioning reference to establish durable state without staging the final shot', () => {
    const prompt = buildEntityVerifyPrompt(
      'object',
      'Mark 39 nuclear bomb',
      'parachute deployed while descending through the sky',
      'conditioning_reference',
    )
    expect(prompt.system).toContain('CONDITIONING REFERENCE')
    expect(prompt.system).toContain('camera angle, background, placement, and transient action may differ')
    expect(prompt.system).toContain('durable visible configuration or historical state')
  })

  it('verifies a derived state against source continuity without demanding later marks', () => {
    const prompt = buildIdentityStateVerifyPrompt('Duchamp Fountain', 'an upright, unmarked porcelain urinal')
    expect(prompt.system).toContain('IMAGE 1 is the verified source identity')
    expect(prompt.system).toContain('IMAGE 2 preserves IMAGE 1')
    expect(prompt.system).toContain('removing IMAGE 1\'s signature is REQUIRED')
    expect(prompt.userMessage).toContain('identityPreserved')
    expect(prompt.userMessage).toContain('candidateMatchesTargetExactly')
    expect(prompt.system).toContain('identityPreserved=true AND candidateMatchesTargetExactly=true')
    expect(prompt.userMessage).toContain('an upright, unmarked porcelain urinal')
  })

  it('allows an explicitly destructive target to change intact structure without erasing identity', () => {
    const prompt = buildIdentityStateVerifyPrompt(
      'B-52 aircraft',
      'broken apart in mid-air with separated fuselage sections and detached components',
    )
    expect(prompt.system).toContain('DESTRUCTIVE OR FORM-CHANGING TARGETS')
    expect(prompt.system).toContain('do NOT require IMAGE 2 to remain intact')
    expect(prompt.system).toContain('cannot by itself make identityPreserved false')
    expect(prompt.userMessage).toContain('same aircraft model breaking apart')
    expect(prompt.userMessage).toContain('different aircraft model or unidentifiable generic debris')
  })
})
