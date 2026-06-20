import { describe, it, expect } from 'vitest'
import { moodMatchScore, toMoodBuckets } from './mood-match.js'

describe('moodMatchScore', () => {
  it('matches rich story moods to generic bed tags via buckets (the render case)', () => {
    const reel = ['dread', 'sacred_unease', 'grief', 'supernatural_warmth']
    const intense = moodMatchScore(reel, ['tense', 'intense', 'dark'])
    const calm = moodMatchScore(reel, ['calm', 'sparse', 'restrained'])
    expect(intense).toBeGreaterThan(calm) // dread/unease → dark/tense, NOT calm
    expect(intense).toBeGreaterThan(0)
  })

  it('matches calm story moods to the calm bed', () => {
    const reel = ['serene', 'gentle', 'peaceful']
    expect(moodMatchScore(reel, ['calm', 'sparse', 'restrained'])).toBeGreaterThan(
      moodMatchScore(reel, ['tense', 'intense', 'dark']),
    )
  })

  it('no shared bucket scores 0', () => {
    expect(moodMatchScore(['playful', 'goofy'], ['dark', 'tense'])).toBe(0)
  })

  it('expands compound tags into multiple buckets', () => {
    const b = toMoodBuckets(['supernatural_warmth'])
    expect(b.has('eerie')).toBe(true)
    expect(b.has('warm')).toBe(true)
  })

  it('empty tags → no buckets', () => {
    expect(toMoodBuckets([]).size).toBe(0)
    expect(moodMatchScore([], ['dark'])).toBe(0)
  })
})
