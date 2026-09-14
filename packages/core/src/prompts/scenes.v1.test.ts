import { describe, it, expect } from 'vitest'
import { classifyGenre, asGenreModule, buildScenesPrompt, GENRE_MODULE_VALUES, resolveMediaGenre } from './scenes.v1.js'

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

describe('resolveMediaGenre', () => {
  it('retains known defaults and the EBN documentary register', () => {
    for (const genreCategory of GENRE_MODULE_VALUES) {
      expect(resolveMediaGenre({ genreCategory, niche: 'horror' })).toBe(genreCategory)
      expect(resolveMediaGenre({ genreCategory, storyMode: 'ebn' })).toBe('informational')
    }
    expect(resolveMediaGenre({ genreCategory: 'science history', storyMode: 'ebn' })).toBe('informational')
  })

  it.each(['cozy mystery', 'constructor', '__proto__', '日常の小さな物語'])(
    'uses neutral defaults for explicit %s even when the niche contains an excluded genre', (genreCategory) => {
      expect(resolveMediaGenre({ genreCategory, niche: 'gentle puzzles with no horror or scary imagery' })).toBe('general')
    },
  )

  it('only classifies legacy missing labels from the niche', () => {
    for (const genreCategory of [undefined, null, '', '  ']) {
      expect(resolveMediaGenre({ genreCategory, niche: 'horror stories' })).toBe('horror')
    }
  })
})

describe('buildScenesPrompt', () => {
  it('retains the declared custom genre without injecting a module inferred from its exclusions', () => {
    const vars = {
      bibleEntitiesJson: '[]', era: 'present', regionDescriptor: 'a small town',
      nicheDescription: 'gentle puzzles with no horror or scary imagery', genreCategory: 'cozy mystery',
      narration: 'The missing teacup was beside the stove.', minScenes: 1, maxScenes: 2, peakMoment: '', maxVideoTiers: 0,
    }
    const custom = buildScenesPrompt(vars)
    expect(custom.system).toContain('DECLARED GENRE: cozy mystery')
    expect(custom.userMessage).not.toContain('GENRE — HORROR / THRILLER / PARANORMAL')
    expect(custom.userMessage).not.toContain('GENRE — INFORMATIONAL / NEWS / EDUCATIONAL')
    const evidenceBased = buildScenesPrompt({ ...vars, storyMode: 'ebn' })
    expect(evidenceBased.system).toContain('DECLARED GENRE: cozy mystery')
    expect(evidenceBased.userMessage).toContain('GENRE — INFORMATIONAL / NEWS / EDUCATIONAL')
  })

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

  it('routes unsourced restricted real people to representative staging', () => {
    const { userMessage } = buildScenesPrompt({
      bibleEntitiesJson: JSON.stringify([
        { id: 'john-aaron', kind: 'character', depiction: { depictionMode: 'archival_only' } },
      ]),
      era: '1969',
      regionDescriptor: 'United States',
      nicheDescription: 'documentary space history',
      narration: 'John Aaron recognized the telemetry pattern and recommended SCE to AUX.',
      minScenes: 1,
      maxScenes: 2,
      peakMoment: '',
      maxVideoTiers: 0,
    })

    expect(userMessage).toContain('ARCHIVAL-ONLY AND IDENTITY-WITHHELD PEOPLE')
    expect(userMessage).toContain('Do not tag either person merely because the narration names them')
    expect(userMessage).toContain('A portrait cannot depict an unrecorded decision, realization, recommendation, dialogue, or switch action')
  })
})
