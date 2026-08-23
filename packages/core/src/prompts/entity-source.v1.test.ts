import { describe, expect, it } from 'vitest'
import { buildEntitySourceDecidePrompt } from './entity-source.v1.js'

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
})
