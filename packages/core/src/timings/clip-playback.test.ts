import { describe, it, expect } from 'vitest'
import { clipPlaybackRate, clipMsToReelMs, clipVisibleEndMs } from './clip-playback.js'

describe('clipPlaybackRate', () => {
  it('is 1 when clip == scene (no stretch)', () => {
    expect(clipPlaybackRate(5, 5)).toBe(1)
  })
  it('slows down (rate < 1) when the scene is longer than the clip', () => {
    expect(clipPlaybackRate(5, 8)).toBeCloseTo(0.625, 3)
  })
  it('clamps at the 0.5 floor for a very long scene (never an unnatural crawl)', () => {
    expect(clipPlaybackRate(5, 20)).toBe(0.5)
  })
  it('never speeds up past 1 when the clip is longer than the scene', () => {
    expect(clipPlaybackRate(10, 5)).toBe(1)
  })
  it('degrades safely on zero/negative inputs', () => {
    expect(clipPlaybackRate(5, 0)).toBe(1)
    expect(clipPlaybackRate(0, 5)).toBe(1)
  })
})

describe('clipMsToReelMs', () => {
  it('is scene start + clipMs at rate 1', () => {
    expect(clipMsToReelMs(3000, 2000, 1)).toBe(5000)
  })
  it('stretches the offset when slowed (rate 0.5 → clip 2s lands at 4s into the scene)', () => {
    expect(clipMsToReelMs(1000, 2000, 0.5)).toBe(5000)
  })
})

describe('clipVisibleEndMs', () => {
  it('is the stretched clip end when it finishes before the scene does', () => {
    // 5s clip at rate 0.5 stretches to 10s → ends at scene start + 10000.
    expect(clipVisibleEndMs(0, 20000, 5, 0.5)).toBe(10000)
  })
  it('is capped by the scene end (frozen-tail region excluded)', () => {
    // 5s clip at rate 1 would end at 5000, but the scene ends at 4000.
    expect(clipVisibleEndMs(0, 4000, 5, 1)).toBe(4000)
  })
})
