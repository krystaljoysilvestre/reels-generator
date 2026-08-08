import { describe, it, expect } from 'vitest'
import {
  splitNumberedSentences,
  spliceSentences,
  reindex,
  validateRegion,
  quoteMatchesRegion,
  BoundedEditError,
} from './bounded-edit.js'

// A realistic narration: one beat per line, a quoted line with internal punctuation, an ellipsis.
const NARRATION = `Alas-dose na, gising pa rin ako.
Nasa lamesa 'yung naka-tape na brown envelope.
Kinatok ko 'yung pinto ni Mama. "Ma. Ngayong taon, hindi ko kaya."
Hindi siya nagalit. "Sige," sabi niya.
Iba pala 'yung katahimikan kapag hindi ka na kailangan.`

describe('splitNumberedSentences', () => {
  it('reconstructs the input byte for byte — the property splicing depends on', () => {
    expect(splitNumberedSentences(NARRATION).raw.join('')).toBe(NARRATION)
  })

  it('numbers every segment and leaves no empty entries', () => {
    const { display, numbered } = splitNumberedSentences(NARRATION)
    expect(display.every((d) => d.length > 0)).toBe(true)
    expect(numbered.startsWith('1. Alas-dose na, gising pa rin ako.')).toBe(true)
  })

  it('keeps a closing quote with its sentence', () => {
    const { display } = splitNumberedSentences('Sabi niya. "Tama na."\nUmalis ako.')
    expect(display).toContain('"Tama na."')
  })

  it('does not split on a mid-sentence period followed by a non-space', () => {
    const { display } = splitNumberedSentences('It cost $4.50 that night.\nThen nothing.')
    expect(display[0]).toBe('It cost $4.50 that night.')
  })

  it('treats a newline as a boundary even without terminal punctuation', () => {
    const { display } = splitNumberedSentences('No period here\nAnd another line')
    expect(display).toEqual(['No period here', 'And another line'])
  })

  it('folds a blank line into its neighbour rather than numbering whitespace', () => {
    const { display, raw } = splitNumberedSentences('First beat.\n\nSecond beat.')
    expect(display).toEqual(['First beat.', 'Second beat.'])
    expect(raw.join('')).toBe('First beat.\n\nSecond beat.')
  })

  it('splits inside a quoted line at internal sentence ends (pinned behaviour)', () => {
    // `Kinatok ko … Mama. "Ma. Ngayong taon, hindi ko kaya."` becomes three segments. That is ordinary
    // sentence splitting, and it is fine for bounded edits: the region is delimited by INDICES the
    // critic chose from this exact numbering, so granularity finer than a line costs nothing.
    const { display } = splitNumberedSentences(NARRATION)
    expect(display).toContain('Kinatok ko \'yung pinto ni Mama.')
    expect(display).toContain('"Ma.')
    expect(display).toContain('Ngayong taon, hindi ko kaya."')
  })

  it('survives an empty artifact', () => {
    expect(splitNumberedSentences('').raw).toEqual([])
  })
})

describe('spliceSentences', () => {
  it('replaces the final sentence and leaves the prefix byte-identical', () => {
    const { raw } = splitNumberedSentences(NARRATION)
    const last = raw.length - 1
    const out = spliceSentences(NARRATION, { start: last, end: last }, 'Hindi na tumapik ang kahit sino sa balikat ko.')
    expect(out.narration.startsWith(out.prefix)).toBe(true)
    expect(out.prefix).toBe(raw.slice(0, last).join(''))
    expect(out.removed.trim()).toBe('Iba pala \'yung katahimikan kapag hindi ka na kailangan.')
    expect(out.narration).toContain('Hindi na tumapik ang kahit sino sa balikat ko.')
    expect(out.narration).not.toContain('Iba pala')
  })

  it('replaces a multi-sentence region and preserves the suffix verbatim', () => {
    const text = 'One.\nTwo.\nThree.\nFour.'
    const out = spliceSentences(text, { start: 1, end: 2 }, 'Replaced.')
    expect(out.narration).toBe('One.\nReplaced.\nFour.')
  })

  it('preserves the removed span trailing newline so formatting survives', () => {
    const out = spliceSentences('One.\nTwo.\nThree.', { start: 1, end: 1 }, 'New line here.')
    expect(out.narration).toBe('One.\nNew line here.\nThree.')
  })

  it('rejects out-of-range indices', () => {
    expect(() => spliceSentences(NARRATION, { start: 0, end: 99 }, 'x.')).toThrow(BoundedEditError)
    expect(() => spliceSentences(NARRATION, { start: -1, end: 1 }, 'x.')).toThrow(BoundedEditError)
  })

  it('rejects an inverted region', () => {
    expect(() => spliceSentences(NARRATION, { start: 3, end: 1 }, 'x.')).toThrow(/out of range/)
  })

  it('rejects a non-integer region', () => {
    expect(() => spliceSentences(NARRATION, { start: 1.5, end: 2 }, 'x.')).toThrow(/integers/)
  })

  it('rejects an empty replacement', () => {
    expect(() => spliceSentences(NARRATION, { start: 4, end: 4 }, '   ')).toThrow(/empty/)
  })

  it('holds the prefix segmentation even when the replacement lacks terminal punctuation', () => {
    // Every prefix ends at a hard boundary (terminal+whitespace, or a newline), so a replacement
    // cannot merge backwards into it. The resplit assertion inside spliceSentences is therefore
    // defensive rather than load-bearing today — it exists so a future change to the splitter cannot
    // silently move a boundary underneath a prefix that still matches character-for-character.
    const out = spliceSentences('He waited. She left.', { start: 1, end: 1 }, 'she stayed')
    expect(out.narration).toBe('He waited. she stayed')
    expect(splitNumberedSentences(out.narration).raw[0]).toBe('He waited. ')
  })

  it('accepts a multi-line replacement without disturbing the prefix', () => {
    const out = spliceSentences('One.\nTwo.\nThree.', { start: 2, end: 2 }, 'A.\nB.')
    expect(out.narration).toBe('One.\nTwo.\nA.\nB.')
    expect(out.narration.startsWith(out.prefix)).toBe(true)
  })
})

describe('reindex — the artifact changes here, not at splice', () => {
  it('renumbers after an edit so downstream indices describe the new text', () => {
    const spliced = spliceSentences('One.\nTwo.\nThree.', { start: 2, end: 2 }, 'Three point one. Three point two.')
    const after = reindex(spliced.narration)
    expect(after.split.display).toEqual(['One.', 'Two.', 'Three point one.', 'Three point two.'])
  })

  it('normalizes whitespace conservatively and stays reconstructible', () => {
    const { narration, split } = reindex('One.  \n\n\n\nTwo.   Three.\n')
    expect(narration).toBe('One.\n\nTwo. Three.')
    expect(split.raw.join('')).toBe(narration)
  })

  it('leaves clean text untouched', () => {
    expect(reindex(NARRATION).narration).toBe(NARRATION)
  })
})

describe('validateRegion', () => {
  const { raw } = splitNumberedSentences(NARRATION)
  const last = raw.length - 1

  it('accepts a closing region with a sane replacement', () => {
    expect(validateRegion(NARRATION, { start: last, end: last }, 'A short new close.')).toEqual({ ok: true })
  })

  it('rejects a region outside the final 35% — this is what stops a middle rewrite', () => {
    const res = validateRegion(NARRATION, { start: 0, end: 0 }, 'x.')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/outside the final 35%/)
  })

  it('rejects out-of-range and inverted regions', () => {
    expect(validateRegion(NARRATION, { start: 0, end: 99 }, 'x.').ok).toBe(false)
    expect(validateRegion(NARRATION, { start: 4, end: 3 }, 'x.').ok).toBe(false)
  })

  it('rejects an oversized replacement', () => {
    const huge = 'word '.repeat(200)
    const res = validateRegion(NARRATION, { start: last, end: last }, huge)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/× the removed span/)
  })

  it('rejects an empty replacement', () => {
    expect(validateRegion(NARRATION, { start: last, end: last }, '  ').ok).toBe(false)
  })

  it('skips the edit when the protected peak falls inside the region', () => {
    const res = validateRegion(NARRATION, { start: last, end: last }, 'A new close.', {
      protect: ['Iba pala \'yung katahimikan kapag hindi ka na kailangan.'],
    })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/protected text/)
  })

  it('matches a protected peak through quote/dash/case differences', () => {
    const res = validateRegion(NARRATION, { start: last, end: last }, 'A new close.', {
      protect: ['iba pala ’yung katahimikan kapag hindi ka na kailangan.'],
    })
    expect(res.ok).toBe(false)
  })

  it('ignores empty protect entries', () => {
    expect(validateRegion(NARRATION, { start: last, end: last }, 'A new close.', { protect: ['', undefined, null] })).toEqual({ ok: true })
  })

  it('validates the region alone when no replacement exists yet', () => {
    expect(validateRegion(NARRATION, { start: last, end: last }, null)).toEqual({ ok: true })
  })
})

describe('quoteMatchesRegion — the indices are the mechanism, the quote is the receipt', () => {
  const { raw } = splitNumberedSentences(NARRATION)
  const last = raw.length - 1

  it('accepts an exact quote', () => {
    expect(quoteMatchesRegion(NARRATION, { start: last, end: last }, 'Iba pala \'yung katahimikan kapag hindi ka na kailangan.')).toBe(true)
  })

  it('accepts a quote differing only in curly quotes and case', () => {
    expect(quoteMatchesRegion(NARRATION, { start: last, end: last }, 'iba pala ’yung katahimikan kapag hindi ka na kailangan')).toBe(true)
  })

  it('accepts a quote covering part of a multi-sentence region', () => {
    // last-1 is `"Sige," sabi niya.` — a critic that quotes only one sentence of a two-sentence
    // region is still pointing at the same place.
    expect(quoteMatchesRegion(NARRATION, { start: last - 1, end: last }, '"Sige," sabi niya.')).toBe(true)
  })

  it('rejects a quote pointing somewhere else entirely — fail closed', () => {
    expect(quoteMatchesRegion(NARRATION, { start: last, end: last }, 'Nasa lamesa \'yung naka-tape na brown envelope.')).toBe(false)
  })

  it('rejects an empty quote and a bad region', () => {
    expect(quoteMatchesRegion(NARRATION, { start: last, end: last }, '  ')).toBe(false)
    expect(quoteMatchesRegion(NARRATION, { start: 0, end: 99 }, 'anything')).toBe(false)
  })
})
