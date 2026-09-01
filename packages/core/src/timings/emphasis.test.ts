import { describe, it, expect } from 'vitest'
import { pickEmphasis } from './emphasis.js'

// Helper: a word held for `ms`, starting wherever.
const w = (text: string, ms: number, startMs = 0) => ({ text, startMs, endMs: startMs + ms })

describe('pickEmphasis', () => {
  it('picks the word the narrator holds longest', () => {
    // Real timings from "Not because people quit." — the payoff is the held word.
    const words = [w('Not', 120, 0), w('because', 210, 130), w('people', 190, 350), w('quit.', 480, 550)]
    expect(pickEmphasis(words)).toBe(3)
  })

  it('finds a content word mid-line, not just the last one', () => {
    // "at about a thousand miles per hour" — the landing is in the middle.
    const words = [
      w('at', 90, 0), w('about', 160, 100), w('a', 60, 270),
      w('thousand', 420, 340), w('miles', 180, 770), w('per', 90, 960), w('hour', 200, 1060),
    ]
    expect(words[pickEmphasis(words)]!.text).toBe('thousand')
  })

  it('never lands on punctuation or a one-letter token', () => {
    // An em-dash chunk held longer than anything else must still be skipped.
    const words = [w('—', 900, 0), w('I', 800, 950), w('ran', 200, 1800)]
    expect(words[pickEmphasis(words)]!.text).toBe('ran')
  })

  it('falls back to the longest word when every duration is equal', () => {
    // The in-app preview gives each synthetic word the same duration; the tie-break carries it.
    const words = ['you', 'need', 'to', 'see', 'this'].map((t, i) => w(t, 360, i * 360))
    expect(words[pickEmphasis(words)]!.text).toBe('need')
  })

  it('an explicit emphasis flag overrides delivery', () => {
    const words = [
      { ...w('quietly', 100, 0), emphasis: true },
      w('everything', 900, 120),
    ]
    expect(pickEmphasis(words)).toBe(0)
  })

  it('respects an explicitly unaccented line', () => {
    const words = [
      { ...w('Southampton', 900, 0), emphasis: false },
      { ...w('lookouts', 300, 920), emphasis: false },
    ]
    expect(pickEmphasis(words)).toBe(-1)
  })

  it('returns -1 when there is nothing to land on', () => {
    expect(pickEmphasis([])).toBe(-1)
    expect(pickEmphasis([w('—', 400, 0), w('a', 300, 500)])).toBe(-1)
  })

  it('is language-agnostic — no stop-word list, no Latin assumption', () => {
    // Tagalog: the held word wins on delivery alone.
    const words = [w('Hindi', 150, 0), w('siya', 140, 160), w('bumalik.', 520, 320)]
    expect(words[pickEmphasis(words)]!.text).toBe('bumalik.')
    // Japanese: counted by grapheme, so a 2-character word still qualifies.
    const jp = [w('彼は', 200, 0), w('消えた', 600, 220)]
    expect(jp[pickEmphasis(jp)]!.text).toBe('消えた')
  })
})
