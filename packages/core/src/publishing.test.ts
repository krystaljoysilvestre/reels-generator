import { describe, expect, it } from 'vitest'
import { publicationPlatformForTarget, publicationPlatformsForTargets } from './publishing.js'

describe('publication platform mappings', () => {
  it.each([
    ['tiktok', 'tiktok'],
    ['facebook_reels', 'fb'],
    ['instagram_reels', 'ig'],
    ['youtube_shorts', 'yt'],
    ['youtube_long', 'yt'],
  ])('maps %s explicitly to %s', (target, platform) => {
    expect(publicationPlatformForTarget(target!)).toBe(platform)
  })

  it.each(['', 'all', 'unknown', 'ig', 'toString', '__proto__'])('does not invent a destination for %s', (target) => {
    expect(publicationPlatformForTarget(target)).toBeNull()
  })

  it('deduplicates recognized destinations while preserving selection order', () => {
    expect(publicationPlatformsForTargets([
      'instagram_reels', 'youtube_shorts', 'facebook_reels', 'youtube_long', 'tiktok', 'instagram_reels',
    ])).toEqual(['ig', 'yt', 'fb', 'tiktok'])
  })

  it('filters unknown targets instead of silently assigning another platform', () => {
    expect(publicationPlatformsForTargets(['unknown', 'instagram_reels', 'all'])).toEqual(['ig'])
    expect(publicationPlatformsForTargets(['all', 'unknown'])).toEqual([])
    expect(publicationPlatformsForTargets([])).toEqual([])
  })
})
