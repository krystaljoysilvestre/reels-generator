import { describe, it, expect } from 'vitest'
import { matchNarratorVoice } from './match-narrator.js'
import type { ChannelVoice } from '../types/channel.js'

const v = (providerId: string, gender: string, age?: 'young' | 'adult' | 'older'): ChannelVoice => ({
  providerId,
  name: providerId,
  gender,
  age,
  description: '',
})

describe('matchNarratorVoice', () => {
  it('returns undefined for an empty pool', () => {
    expect(matchNarratorVoice([], { gender: 'm', ageBand: 'adult' })).toBeUndefined()
  })

  it('defaults to the first voice with no narrator profile', () => {
    expect(matchNarratorVoice([v('a', 'f'), v('b', 'm')], null)?.providerId).toBe('a')
  })

  it('defaults to the first voice for a neutral narrator (e.g. second-person)', () => {
    expect(matchNarratorVoice([v('a', 'f'), v('b', 'm')], { gender: 'neutral', ageBand: 'adult' })?.providerId).toBe('a')
  })

  it('matches narrator gender', () => {
    expect(matchNarratorVoice([v('a', 'f'), v('b', 'm')], { gender: 'm', ageBand: 'adult' })?.providerId).toBe('b')
  })

  it('falls back to the default when no voice fits the gender', () => {
    expect(matchNarratorVoice([v('a', 'f'), v('b', 'f')], { gender: 'm', ageBand: 'adult' })?.providerId).toBe('a')
  })

  it('breaks gender ties by nearest age when the pool is tagged', () => {
    const pool = [v('young', 'm', 'young'), v('older', 'm', 'older')]
    expect(matchNarratorVoice(pool, { gender: 'm', ageBand: 'older' })?.providerId).toBe('older')
  })

  it('ignores age when the pool carries none (first gender match wins)', () => {
    expect(matchNarratorVoice([v('a', 'm'), v('b', 'm')], { gender: 'm', ageBand: 'young' })?.providerId).toBe('a')
  })
})
