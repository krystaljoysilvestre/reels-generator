import { describe, expect, it } from 'vitest'
import { PLATFORM_PRESETS, resolvePlatformPreset } from './channel.js'

describe('platform duration presets', () => {
  it('accepts YouTube Shorts up to three minutes', () => {
    expect(PLATFORM_PRESETS.youtube_shorts.maxSeconds).toBe(180)
  })

  it('keeps the narrowest cap when Shorts are shared with Facebook Reels', () => {
    const preset = resolvePlatformPreset(['youtube_shorts', 'facebook_reels'])
    expect(preset.maxSeconds).toBe(90)
  })
})
