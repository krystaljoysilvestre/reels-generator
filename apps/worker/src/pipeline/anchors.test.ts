import { describe, it, expect } from 'vitest'
import type { AlignedChar } from '@reels/core'
import { countOccurrences, validateAnchorUniqueness, resolveFirstMs } from './anchors.js'

describe('countOccurrences', () => {
  it('returns 0 for an empty substring', () => {
    expect(countOccurrences('hello', '')).toBe(0)
  })
  it('returns 0 when absent', () => {
    expect(countOccurrences('hello world', 'xyz')).toBe(0)
  })
  it('counts a single and multiple occurrences', () => {
    expect(countOccurrences('the cat sat', 'cat')).toBe(1)
    expect(countOccurrences('na na na', 'na')).toBe(3)
  })
  it('counts overlapping occurrences (pos advances by 1)', () => {
    expect(countOccurrences('aaa', 'aa')).toBe(2)
  })
})

describe('validateAnchorUniqueness', () => {
  const narration = 'She opened the door. The lights flickered. Then silence fell.'

  it('returns no errors when every anchor is unique', () => {
    expect(validateAnchorUniqueness(narration, { sfx: [{ anchor: 'the door' }, { anchor: 'flickered' }] })).toEqual([])
  })
  it('flags an anchor that is absent', () => {
    const errs = validateAnchorUniqueness(narration, { sfx: [{ anchor: 'thunderclap' }] })
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('not found')
    expect(errs[0]).toContain('thunderclap')
  })
  it('flags an ambiguous anchor with its match count', () => {
    const errs = validateAnchorUniqueness('The the the', { sfx: [{ anchor: 'the' }] })
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('ambiguous (2 matches)') // 'The' is case-sensitive → only the two lowercase 'the'
  })
  it('validates the silenceDrop anchor too', () => {
    const errs = validateAnchorUniqueness(narration, { sfx: [], silenceDrop: { anchor: 'not here' } })
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('silenceDrop')
  })
  it('validates the ending-direction anchor too', () => {
    const errs = validateAnchorUniqueness(narration, {
      sfx: [],
      ending: { anchor: 'missing final cadence' },
    })
    expect(errs).toHaveLength(1)
    expect(errs[0]).toContain('ending')
  })
  it('skips empty anchor strings and handles no cues', () => {
    expect(validateAnchorUniqueness(narration, { sfx: [{ anchor: '' }] })).toEqual([])
    expect(validateAnchorUniqueness(narration, { sfx: [], silenceDrop: null })).toEqual([])
  })
})

describe('resolveFirstMs', () => {
  // Build a 1:1 char→timestamp alignment: char i starts at i*100ms.
  const align = (text: string): { cps: string[]; alignment: AlignedChar[] } => {
    const cps = Array.from(text)
    return { cps, alignment: cps.map((ch, i) => ({ ch, startMs: i * 100, endMs: i * 100 + 100 })) }
  }
  const narration = 'hello world'
  const { cps, alignment } = align(narration)
  const durationMs = narration.length * 100

  it('resolves an anchor to its first char start time', () => {
    expect(resolveFirstMs(cps, alignment, 'world', 0, durationMs)).toBe(600) // 'w' is index 6
  })
  it('applies a positive offset', () => {
    expect(resolveFirstMs(cps, alignment, 'world', 50, durationMs)).toBe(650)
  })
  it('clamps a negative offset to 0', () => {
    expect(resolveFirstMs(cps, alignment, 'hello', -9999, durationMs)).toBe(0)
  })
  it('clamps past-end offset to durationMs', () => {
    expect(resolveFirstMs(cps, alignment, 'world', 999999, durationMs)).toBe(durationMs)
  })
  it('returns the FIRST occurrence when the anchor repeats', () => {
    const { cps: c, alignment: a } = align('ab ab')
    expect(resolveFirstMs(c, a, 'ab', 0, 500)).toBe(0)
  })
  it('returns null for an absent, empty, or too-long anchor', () => {
    expect(resolveFirstMs(cps, alignment, 'xyz', 0, durationMs)).toBeNull()
    expect(resolveFirstMs(cps, alignment, '', 0, durationMs)).toBeNull()
    expect(resolveFirstMs(cps, alignment, narration + ' extra', 0, durationMs)).toBeNull()
  })
})
