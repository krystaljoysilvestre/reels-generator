import { describe, it, expect } from 'vitest'
import { resolvePeak } from './generate-story.js'

// The peak that ships to music timing must be a verbatim substring of the final narration.
// resolvePeak recovers a peak whose only difference from a narration line is the character-level
// variance an LLM introduces when told to echo a line "verbatim" (smart quotes, dash style,
// whitespace, trailing punctuation) — while still returning '' when the peak was genuinely cut.
describe('resolvePeak', () => {
  const line = 'Ang peak: "hindi ko na siya nakita" — tapos.'
  const narration = `Una line.\n${line}\nHuling line.`

  it('returns an exact substring unchanged', () => {
    expect(resolvePeak(narration, [line])).toBe(line)
  })

  it('recovers a smart-quote + en-dash + trailing-punctuation variant to the real line', () => {
    const variant = 'Ang peak: “hindi ko na siya nakita” – tapos' // curly quotes, en-dash, no period
    expect(resolvePeak(narration, [variant])).toBe(line)
  })

  it('recovers a collapsed-whitespace variant', () => {
    expect(resolvePeak(narration, ['Ang   peak:  "hindi ko na siya nakita"  —  tapos.'])).toBe(line)
  })

  it('returns "" when the peak was genuinely cut (differs by whole words)', () => {
    expect(resolvePeak(narration, ['a completely different climactic line'])).toBe('')
  })

  it('falls through undefined/empty candidates to the first that resolves', () => {
    expect(resolvePeak(narration, [undefined, '   ', 'Huling line.'])).toBe('Huling line.')
  })
})
