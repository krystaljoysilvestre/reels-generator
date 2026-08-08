import { describe, it, expect } from 'vitest'
import { resolveGenreForNewReel, effectiveGenre } from './genre-resolution.js'
import { resolveStyleForGenre } from '../prompts/story-styles.v1.js'

describe('resolveGenreForNewReel — creation time only', () => {
  it("uses the series' genre when it has an opinion", () => {
    expect(resolveGenreForNewReel({ genreCategory: 'horror' }, { genreCategory: 'informational' })).toBe('horror')
  })
  it('falls through to the channel when the series has NO opinion (null = neutral, not "copy me")', () => {
    expect(resolveGenreForNewReel({ genreCategory: null }, { genreCategory: 'informational' })).toBe('informational')
    expect(resolveGenreForNewReel({}, { genreCategory: 'drama' })).toBe('drama')
  })
  it('falls through for a planner-invented reel with no series at all', () => {
    expect(resolveGenreForNewReel(null, { genreCategory: 'comedy' })).toBe('comedy')
  })
  it('treats whitespace as no opinion rather than passing an empty genre downstream', () => {
    expect(resolveGenreForNewReel({ genreCategory: '  ' }, { genreCategory: 'lifestyle' })).toBe('lifestyle')
  })
  it('never returns empty — an unset channel genre still resolves to a real module', () => {
    expect(resolveGenreForNewReel(null, { genreCategory: '' })).toBe('general')
    expect(resolveGenreForNewReel(null, {})).toBe('general')
  })
  // The neutral-series case is the whole reason genreCategory is nullable: correcting the channel's
  // genre later must fix every neutral series automatically, with no migration and no stale copies.
  it('a neutral series follows the channel when the channel is corrected', () => {
    const series = { genreCategory: null }
    expect(resolveGenreForNewReel(series, { genreCategory: 'horror' })).toBe('horror')
    expect(resolveGenreForNewReel(series, { genreCategory: 'informational' })).toBe('informational')
  })
})

describe('effectiveGenre — the frozen read, everywhere after creation', () => {
  it("reads the reel's frozen genre, NOT the channel's current one", () => {
    // The invariant the freeze exists for: the channel has since been re-derived to something else,
    // and the finished reel must still be judged/rendered/cache-keyed as what it was made as.
    expect(effectiveGenre({ genreCategory: 'horror' }, { genreCategory: 'lifestyle' })).toBe('horror')
  })
  it('falls back to the channel for pre-series reels (genre_category IS NULL)', () => {
    expect(effectiveGenre({ genreCategory: null }, { genreCategory: 'horror' })).toBe('horror')
    expect(effectiveGenre(null, { genreCategory: 'horror' })).toBe('horror')
  })
  it('is unchanged for every existing channel — the no-regression guarantee', () => {
    for (const g of ['horror', 'informational', 'lifestyle', 'drama', 'comedy', 'general']) {
      expect(effectiveGenre({ genreCategory: null }, { genreCategory: g })).toBe(g)
    }
  })
})

describe('resolveStyleForGenre — styles are genre-scoped', () => {
  it("prefers the series' own style when valid for that genre", () => {
    expect(resolveStyleForGenre('horror', 'urban_legend', 'deep_dive')).toBe('urban_legend')
  })
  it("drops a channel style that is invalid under the series' genre, rather than passing a dead id", () => {
    // `deep_dive` is an informational style; under horror it resolves to nothing, so the planner would
    // silently get no style block at all with no way to distinguish that from "no style set".
    expect(resolveStyleForGenre('horror', null, 'deep_dive')).toBe('')
  })
  it("inherits the channel's style when it IS valid for the genre", () => {
    expect(resolveStyleForGenre('horror', null, 'urban_legend')).toBe('urban_legend')
  })
  it('returns pure genre when neither is set', () => {
    expect(resolveStyleForGenre('horror', null, null)).toBe('')
    expect(resolveStyleForGenre('general', 'urban_legend', 'deep_dive')).toBe('') // general has no styles
  })
})
