import { describe, expect, it } from 'vitest'
import { PLATFORM_PRESETS, resolvePlatformPreset, TargetPlatformsSchema } from './channel.js'

describe('platform duration presets', () => {
  it('accepts YouTube Shorts up to three minutes', () => {
    expect(PLATFORM_PRESETS.youtube_shorts.maxSeconds).toBe(180)
  })

  it('keeps the narrowest cap when Shorts are shared with Facebook Reels', () => {
    const preset = resolvePlatformPreset(['youtube_shorts', 'facebook_reels'])
    expect(preset.maxSeconds).toBe(90)
  })

  it('accepts Instagram alone or alongside other vertical destinations', () => {
    expect(TargetPlatformsSchema.parse(['instagram_reels'])).toEqual(['instagram_reels'])
    const targets = ['instagram_reels', 'tiktok', 'youtube_shorts', 'facebook_reels']
    expect(TargetPlatformsSchema.parse(targets)).toEqual(targets)
    expect(resolvePlatformPreset(targets)).toMatchObject({
      aspect: '9:16', width: 1080, height: 1920, maxSeconds: 90,
    })
  })

  it('gives Instagram a conservative vertical output preset', () => {
    expect(resolvePlatformPreset(['instagram_reels'])).toMatchObject({
      label: 'Instagram Reels', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 90,
    })
  })

  it('does not allow Instagram to share a widescreen channel', () => {
    expect(TargetPlatformsSchema.safeParse(['instagram_reels', 'youtube_long']).success).toBe(false)
  })

  it('deduplicates selected Instagram destinations and rejects unknown targets', () => {
    expect(TargetPlatformsSchema.parse(['instagram_reels', 'instagram_reels'])).toEqual(['instagram_reels'])
    expect(TargetPlatformsSchema.safeParse(['instagram_reels', 'unknown']).success).toBe(false)
  })
})
