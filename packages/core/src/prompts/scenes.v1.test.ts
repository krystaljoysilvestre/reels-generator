import { describe, it, expect } from 'vitest'
import { classifyGenre, asGenreModule, buildScenesPrompt, GENRE_MODULE_VALUES } from './scenes.v1.js'

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

describe('buildScenesPrompt', () => {
  it('does not let an attempted event become a successful visual outcome', () => {
    const { userMessage } = buildScenesPrompt({
      bibleEntitiesJson: '[]',
      era: '1917',
      regionDescriptor: 'New York City',
      nicheDescription: 'documentary art history',
      narration: 'He submitted the work, but the Society excluded it.',
      minScenes: 1,
      maxScenes: 2,
      peakMoment: '',
      maxVideoTiers: 0,
    })

    expect(userMessage).toContain('ATTEMPT IS NOT OUTCOME')
    expect(userMessage).toContain('not public display or acceptance')
  })

  it('does not invent an exact venue for an organization or historical event', () => {
    const { userMessage } = buildScenesPrompt({
      bibleEntitiesJson: '[]',
      era: '1917',
      regionDescriptor: 'New York City',
      nicheDescription: 'documentary art history',
      narration: 'The directors voted to reject the work.',
      minScenes: 1,
      maxScenes: 2,
      peakMoment: '',
      maxVideoTiers: 0,
    })

    expect(userMessage).toContain('HISTORICAL EVENT CONTEXT IS NOT A VENUE REFERENCE')
    expect(userMessage).toContain('do not invent a documentary-looking overview')
    expect(userMessage).toContain('locationEntityId remain unbound')
  })

  it('separates presenting verified evidence from conditioning a reconstruction', () => {
    const { userMessage } = buildScenesPrompt({
      bibleEntitiesJson: JSON.stringify([{ id: 'the-blind-man-magazine', kind: 'object' }]),
      era: '1917',
      regionDescriptor: 'New York City',
      nicheDescription: 'documentary art history',
      narration: 'The Blind Man published the photograph and defended Fountain.',
      minScenes: 1,
      maxScenes: 2,
      peakMoment: '',
      maxVideoTiers: 0,
    })

    expect(userMessage).toContain('sourcePresentationEntity')
    expect(userMessage).toContain('verified source pixels untouched')
    expect(userMessage).toContain('future publication not yet present')
  })
})
