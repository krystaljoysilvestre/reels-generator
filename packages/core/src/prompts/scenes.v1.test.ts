import { describe, it, expect } from 'vitest'
import { classifyGenre, asGenreModule, GENRE_MODULE_VALUES } from './scenes.v1.js'

describe('classifyGenre', () => {
  it('keeps the original three buckets' + "' priority", () => {
    expect(classifyGenre('Filipino horror stories, aswang at multo')).toBe('horror')
    expect(classifyGenre('science explainers and history facts')).toBe('informational')
    expect(classifyGenre('street food and travel vlogs')).toBe('lifestyle')
  })

  it('classifies the new writing genres', () => {
    expect(classifyGenre('reddit AITA storytime')).toBe('reddit_story')
    expect(classifyGenre('hot takes and rants about local showbiz')).toBe('commentary')
    expect(classifyGenre('hugot heartbreak love stories')).toBe('drama')
    expect(classifyGenre('funny skits and prank stories')).toBe('comedy')
  })

  it('existing buckets still outrank new ones (backward compat)', () => {
    // "reddit horror stories" should stay horror — the visual/writing language is horror.
    expect(classifyGenre('reddit horror stories')).toBe('horror')
    // "family vlog" stays lifestyle (vlog) even though "family" is a drama keyword.
    expect(classifyGenre('family vlog')).toBe('lifestyle')
  })

  it('falls through to general', () => {
    expect(classifyGenre('daily bible verses')).toBe('general')
  })
})

describe('asGenreModule', () => {
  it('accepts every declared bucket', () => {
    for (const g of GENRE_MODULE_VALUES) expect(asGenreModule(g)).toBe(g)
  })
  it('rejects unknown / empty values', () => {
    expect(asGenreModule('thriller')).toBeNull()
    expect(asGenreModule('')).toBeNull()
    expect(asGenreModule(null)).toBeNull()
    expect(asGenreModule(undefined)).toBeNull()
  })
})
