import { describe, it, expect } from 'vitest'
import { planChapters, legsForChapter, CHAPTER_THRESHOLD_SEC } from './chapters.js'
import type { JourneyLeg } from '../types/story-bible.js'

// ~2.5 words/sec (the shared rate): N seconds of narration ≈ N * 2.5 words.
function narrationOfSeconds(seconds: number): string {
  const sentences: string[] = []
  let words = 0
  const target = Math.round(seconds * 2.5)
  let n = 0
  while (words < target) {
    n++
    const s = `Sentence ${n} keeps the story moving forward with a few plain words.`
    sentences.push(s)
    words += s.split(/\s+/).length
  }
  return sentences.join(' ')
}

const leg = (span: string, over: Partial<JourneyLeg> = {}): JourneyLeg => ({
  span,
  locationLabel: 'somewhere',
  locationEntityId: null,
  present: [],
  visible: [],
  isReflection: false,
  ...over,
})

describe('planChapters', () => {
  it('returns a single whole-story chapter at or under the threshold', () => {
    const narration = narrationOfSeconds(CHAPTER_THRESHOLD_SEC - 30)
    const chapters = planChapters(narration)
    expect(chapters).toHaveLength(1)
    expect(chapters[0]!.text).toBe(narration)
    expect(chapters[0]!.startOffset).toBe(0)
    expect(chapters[0]!.endOffset).toBe(narration.length)
  })

  it('tiles a long narration byte-exactly across multiple chapters', () => {
    const narration = narrationOfSeconds(600)
    const chapters = planChapters(narration)
    expect(chapters.length).toBeGreaterThan(1)
    // Chapters concatenate back to the narration and their offsets chain with no gaps.
    expect(chapters.map((c) => c.text).join('')).toBe(narration)
    let cursor = 0
    for (const c of chapters) {
      expect(c.startOffset).toBe(cursor)
      expect(narration.slice(c.startOffset, c.endOffset)).toBe(c.text)
      cursor = c.endOffset
    }
    expect(cursor).toBe(narration.length)
  })

  it('keeps every chapter inside one breakdown call\'s comfort zone', () => {
    const narration = narrationOfSeconds(600)
    for (const c of planChapters(narration)) {
      expect(c.estSec).toBeLessThanOrEqual(250) // 14 scenes × ~16s + slack — the schema-feasible span
      expect(c.estSec).toBeGreaterThanOrEqual(30)
    }
  })

  it('never cuts mid-word', () => {
    const narration = narrationOfSeconds(500)
    for (const c of planChapters(narration).slice(1)) {
      // Each later chapter starts at a whitespace boundary (the char before it is whitespace or the cut
      // itself is on whitespace).
      const before = narration[c.startOffset - 1]!
      const at = narration[c.startOffset]!
      expect(/\s/.test(before) || /\s/.test(at)).toBe(true)
    }
  })

  it('prefers a journey-leg end over a nearer sentence end as the chapter seam', () => {
    const narration = narrationOfSeconds(290) // ~2 chapters → one cut at ~the midpoint
    // Put the leg end ~8% left of the ideal cut — inside the window, but with sentence ends nearer the
    // ideal. The planner should still snap to the leg end (a place/company change beats size symmetry).
    const ideal = Math.round(narration.length / 2)
    const legEnd = narration.indexOf('. ', Math.round(ideal * 0.84)) + 2
    expect(legEnd).toBeGreaterThan(2)
    expect(legEnd).toBeLessThan(ideal)
    const journey = [leg(narration.slice(0, legEnd)), leg(narration.slice(legEnd))] // verbatim spans
    const chapters = planChapters(narration, journey)
    expect(chapters).toHaveLength(2)
    expect(chapters[0]!.endOffset).toBe(legEnd)
  })
})

describe('legsForChapter', () => {
  it('returns the legs overlapping a chapter, whole', () => {
    const narration = 'First leg here. Second leg follows after. Third leg ends the story.'
    const journey = [leg('First leg here.'), leg('Second leg follows after.'), leg('Third leg ends the story.')]
    const chapter = { startOffset: 0, endOffset: narration.indexOf('Third') }
    const legs = legsForChapter(narration, journey, chapter)
    expect(legs.map((l) => l.span)).toEqual(['First leg here.', 'Second leg follows after.'])
  })

  it('includes a leg that straddles the seam', () => {
    const narration = 'First leg here. Second leg follows after. Third leg ends the story.'
    const journey = [leg('First leg here.'), leg('Second leg follows after. Third leg ends the story.')]
    const chapter = { startOffset: 0, endOffset: narration.indexOf('after') }
    const legs = legsForChapter(narration, journey, chapter)
    expect(legs).toHaveLength(2)
  })
})
