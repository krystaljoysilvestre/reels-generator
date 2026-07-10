import { describe, it, expect } from 'vitest'
import { buildFoleySpotPrompt, FoleySpotSchema } from './foley-spot.v1.js'

describe('FoleySpotSchema', () => {
  const one = (extra: Record<string, unknown>) =>
    FoleySpotSchema.parse({ events: [{ description: 'd', sfxPrompt: 'p', atSec: 1, ...extra }] }).events[0]!

  it('defaults events to [] (empty spot is valid)', () => {
    expect(FoleySpotSchema.parse({}).events).toEqual([])
  })
  it('caps events at 3', () => {
    const mk = (n: number) => ({ events: Array.from({ length: n }, () => ({ description: 'd', sfxPrompt: 'p', atSec: 1 })) })
    expect(() => FoleySpotSchema.parse(mk(3))).not.toThrow()
    expect(() => FoleySpotSchema.parse(mk(4))).toThrow()
  })
  it('clamps volumeDb into the realism band [-10, -6] instead of rejecting', () => {
    expect(one({ volumeDb: 5 }).volumeDb).toBe(-6)
    expect(one({ volumeDb: -40 }).volumeDb).toBe(-10)
    expect(one({}).volumeDb).toBe(-8) // default
  })
  it('clamps durationSec into [0.5, 3]', () => {
    expect(one({ durationSec: 0.1 }).durationSec).toBe(0.5)
    expect(one({ durationSec: 9 }).durationSec).toBe(3)
    expect(one({}).durationSec).toBe(1.5) // default
  })
  it('floors a negative atSec at 0', () => {
    expect(one({ atSec: -2 }).atSec).toBe(0)
  })
})

describe('buildFoleySpotPrompt', () => {
  it('lists the frame timestamps and the clip length, and permits an empty answer', () => {
    const { system, userMessage } = buildFoleySpotPrompt({ durationSec: 5, frameTimestampsSec: [0, 0.5, 1], motionPrompt: 'she opens the door' })
    expect(system).toMatch(/SPOTTING/i)
    expect(userMessage).toMatch(/0\.0s, 0\.5s, 1\.0s/)
    expect(userMessage).toMatch(/5\.0/)
    expect(userMessage).toMatch(/empty list is the correct answer|"events": \[\]/i)
    // Vocal/ambience are explicitly excluded.
    expect(userMessage).toMatch(/NO voices|never performance/i)
    expect(userMessage).toMatch(/she opens the door/)
  })
})
