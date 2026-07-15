import { describe, it, expect } from 'vitest'
import { resolvePeak } from './generate-story.js'

// The studio pipeline's peakMoment chain: the anchor must be a VERBATIM substring of the final
// narration (music timing depends on it), falling back stage → writer → '' (NULL twist_anchor →
// breakdown-scenes re-extracts via peak-extract.v1).
describe('resolvePeak', () => {
  const narration = 'Tahimik ang bahay.\nMay tao sa likod ko.\nNakangiti.'

  it('keeps the last stage\'s peak when it survives in the text', () => {
    expect(resolvePeak(narration, ['May tao sa likod ko.', 'Nakangiti.'])).toBe('May tao sa likod ko.')
  })

  it('falls back to the writer\'s original when the stage peak was edited away', () => {
    expect(resolvePeak(narration, ['May tao sa likod ko!!', 'Nakangiti.'])).toBe('Nakangiti.')
  })

  it('returns empty (→ NULL anchor → re-extract) when no candidate survives', () => {
    expect(resolvePeak(narration, ['gone', 'also gone'])).toBe('')
  })

  it('skips empty/undefined candidates and trims whitespace', () => {
    expect(resolvePeak(narration, [undefined, '  ', ' Nakangiti. '])).toBe('Nakangiti.')
  })
})
