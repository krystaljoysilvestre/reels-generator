import { describe, expect, it } from 'vitest'
import { displayDurationSeconds, fmtClock } from './scene-timing'

describe('displayDurationSeconds', () => {
  it('uses persisted render timing while video metadata is still unavailable', () => {
    expect(fmtClock(displayDurationSeconds(null, 99.197, 85))).toBe('1:39')
  })

  it('prefers the finished media measurement when it is available', () => {
    expect(displayDurationSeconds(99.219, 99.197, 85)).toBe(99.219)
  })

  it('falls back to the storyboard estimate for an unrendered reel', () => {
    expect(displayDurationSeconds(null, null, 85)).toBe(85)
  })
})
