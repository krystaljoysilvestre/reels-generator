import { describe, expect, it } from 'vitest'
import { GenreCategorySchema } from '@reels/core'
import { GENRE_MODULE_VALUES } from '@reels/core/prompts/scenes.v1'
import { GENRE_OPTIONS, genreFromInput, genreLabel } from './genre-labels.js'

describe('editable genre labels', () => {
  it('offers every known genre while preserving their stored IDs', () => {
    expect(GENRE_OPTIONS.map((genre) => genre.value).sort()).toEqual([...GENRE_MODULE_VALUES].sort())
    for (const genre of GENRE_OPTIONS) expect(genreFromInput(genreLabel(genre.value))).toBe(genre.value)
  })

  it.each(['cozy mystery', 'romantic science fiction', '詩と日常'])('round-trips a custom label: %s', (genre) => {
    const saved = JSON.parse(JSON.stringify({ genreCategory: genreFromInput(genre) })) as { genreCategory: unknown }
    expect(genreLabel(GenreCategorySchema.parse(saved.genreCategory))).toBe(genre)
  })

  it('does not remove a space while the creator types a multi-word genre', () => {
    expect(genreLabel(genreFromInput('cozy '))).toBe('cozy ')
  })
})
