import { describe, it, expect } from 'vitest'
import { clipPlaybackRate, clipMsToReelMs, clipVisibleEndMs, freezePushFrames } from './clip-playback.js'

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

describe('freezePushFrames — keeping the frozen tail alive (§4.65)', () => {
  it('returns null when the clip exactly fills the scene (the range that crashed a real render)', () => {
    // rate clamps to 1, so the clip ends on the scene's own last frame → start === end → Remotion's
    // interpolate() would throw "inputRange must be strictly monotonically increasing".
    expect(freezePushFrames(5, 5, 30)).toBeNull()
    const push = freezePushFrames(11.57, 11.57, 30)
    expect(push).toBeNull()
  })

  it('returns a range when the scene outlasts the stretched clip', () => {
    // 5s clip in a 12s scene: rate clamps at 0.5, so the clip covers 10s and 2s freeze remains.
    const push = freezePushFrames(5, 12, 30)
    expect(push).not.toBeNull()
    expect(push!.from).toBe(300)   // 5 / 0.5 * 30
    expect(push!.to).toBe(360)     // 12 * 30
    expect(push!.to).toBeGreaterThan(push!.from)
  })

  it('ignores a freeze too short to read as motion', () => {
    expect(freezePushFrames(5, 5.05, 30)).toBeNull() // ~1 frame of freeze
  })

  it('never returns an inverted or zero-width range for any plausible input', () => {
    for (const clip of [5, 10]) {
      for (const scene of [1, 4.9, 5, 5.1, 7.5, 10, 10.1, 20, 40]) {
        const push = freezePushFrames(clip, scene, 30)
        if (push) expect(push.to - push.from).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('is defensive about degenerate inputs', () => {
    expect(freezePushFrames(0, 10, 30)).toBeNull()
    expect(freezePushFrames(5, 0, 30)).toBeNull()
    expect(freezePushFrames(5, 10, 0)).toBeNull()
  })
})
