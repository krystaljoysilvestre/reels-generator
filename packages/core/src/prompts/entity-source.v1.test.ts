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

  it('treats an exact edition or state as part of object identity', () => {
    const prompt = buildEntityVerifyPrompt('object', 'The Blind Man', 'May 1917 issue featuring Fountain')
    expect(prompt.system).toContain('dated issue, edition, version')
    expect(prompt.system).toContain('different edition/state')
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
})
