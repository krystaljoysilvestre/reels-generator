import { describe, expect, it } from 'vitest'
import { GenreCategorySchema } from './genre.js'
import { ChannelDerivationSchema } from '../prompts/channel.v1.js'

describe('open genre labels', () => {
  it.each(['cozy mystery', 'romantic science fiction', 'Alamat at pag-ibig', '詩と日常', 'horror'])('preserves %s in channel and series derivation', (genre) => {
    expect(GenreCategorySchema.parse(` ${genre} `)).toBe(genre)
    expect(ChannelDerivationSchema.shape.genreCategory.parse(genre)).toBe(genre)
    expect(ChannelDerivationSchema.shape.series.parse([{ name: 'Stories', genreCategory: genre }])[0]?.genreCategory).toBe(genre)
  })

  it.each(['', '   ', 'x'.repeat(121), null, 42])('rejects an invalid label: %s', (genre) => {
    expect(GenreCategorySchema.safeParse(genre).success).toBe(false)
  })
})
