import { describe, it, expect } from 'vitest'
import { CoverFrameRankingSchema, normalizeTextSpace } from './cover-frame.v1.js'

// These cover the MECHANICAL half of the contract, and they exist because the strict version of it failed
// on the very first live run: the model wrote 170-200 character reasons and answered "top or bottom" for a
// frame with space in two places. Neither was a bad ranking, but a strict schema turned both into a hard
// failure that burned a repair round and 6c. Asking more nicely in the prompt is the lever this repo has
// repeatedly measured as weak; normalising in code is the one that holds.

describe('cover-frame ranking schema', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    candidate: 0,
    score: 8,
    reason: 'Clear subject, good contrast.',
    textSpace: 'bottom',
    ...over,
  })

  it('accepts a well-formed ranking', () => {
    const parsed = CoverFrameRankingSchema.parse({ ranked: [entry()] })
    expect(parsed.ranked[0]?.score).toBe(8)
    expect(parsed.ranked[0]?.reason).toBe('Clear subject, good contrast.')
  })

  it('TRUNCATES an over-long reason instead of rejecting the whole ranking', () => {
    const long = 'Clear office with active workers at desks. '.repeat(8) // ~340 chars
    const parsed = CoverFrameRankingSchema.parse({ ranked: [entry({ reason: long })] })
    const reason = parsed.ranked[0]!.reason
    expect(reason.length).toBeLessThanOrEqual(160)
    expect(reason.endsWith('…')).toBe(true)
  })

  it('keeps a short reason exactly as written, trimmed', () => {
    const parsed = CoverFrameRankingSchema.parse({ ranked: [entry({ reason: '  Strong focal subject.  ' })] })
    expect(parsed.ranked[0]!.reason).toBe('Strong focal subject.')
  })

  it('rejects an empty reason — a blank recommendation is not usable in the picker', () => {
    expect(() => CoverFrameRankingSchema.parse({ ranked: [entry({ reason: '' })] })).toThrow()
  })

  it('requires at least one ranked entry', () => {
    expect(() => CoverFrameRankingSchema.parse({ ranked: [] })).toThrow()
  })
})

describe('normalizeTextSpace', () => {
  it('passes the exact values through', () => {
    for (const v of ['top', 'bottom', 'left', 'right', 'none'] as const) {
      expect(normalizeTextSpace(v)).toBe(v)
    }
  })

  it('takes the first named region from a compound answer — the real observed failure', () => {
    expect(normalizeTextSpace('top or bottom')).toBe('top')
    expect(normalizeTextSpace('bottom-left')).toBe('bottom')
  })

  it('is case-insensitive', () => {
    expect(normalizeTextSpace('TOP')).toBe('top')
    expect(normalizeTextSpace('Bottom')).toBe('bottom')
  })

  it('falls back to none rather than throwing on something unrecognisable', () => {
    expect(normalizeTextSpace('anywhere really')).toBe('none')
    expect(normalizeTextSpace('')).toBe('none')
  })
})
