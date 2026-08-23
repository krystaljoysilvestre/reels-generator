import { describe, expect, it } from 'vitest'
import { buildStateAdaptationPrompt, sourceQueryCandidates } from './generate-images.js'

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

  it('does not broaden human identity searches', () => {
    expect(sourceQueryCandidates({ id: 'marcel-duchamp', description: 'artist' }, {
      query: 'Marcel Duchamp photograph', subjectClass: 'human',
    })).toEqual(['Marcel Duchamp photograph'])
  })

  it('locks source geometry and required state details during adaptation', () => {
    const prompt = buildStateAdaptationPrompt('documentary reference plate', "turned on its back, marked 'R. Mutt 1917'")
    expect(prompt).toContain('Preserve the source subject\'s exact physical geometry')
    expect(prompt).toContain("marked 'R. Mutt 1917'")
    expect(prompt).toContain('Do not omit')
  })
})
