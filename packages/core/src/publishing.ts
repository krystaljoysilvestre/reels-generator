/** Publication records use these platform keys; channel targets also carry the video format. */
export type PublicationPlatform = 'yt' | 'fb' | 'ig' | 'tiktok'

export const PUBLICATION_PLATFORM_LABELS: Record<PublicationPlatform, string> = {
  yt: 'YouTube',
  fb: 'Facebook',
  ig: 'Instagram',
  tiktok: 'TikTok',
}

/** Unknown and legacy umbrella targets must never invent a destination. */
export function publicationPlatformForTarget(target: string): PublicationPlatform | null {
  switch (target) {
    case 'youtube_shorts':
    case 'youtube_long':
      return 'yt'
    case 'facebook_reels':
      return 'fb'
    case 'instagram_reels':
      return 'ig'
    case 'tiktok':
      return 'tiktok'
    default:
      return null
  }
}

/**
 * Returns recognized, distinct destinations in selection order. Callers deciding whether a reel
 * is fully published must separately require a nonempty set with every selected target recognized.
 */
export function publicationPlatformsForTargets(targets: readonly string[]): PublicationPlatform[] {
  const platforms = new Set<PublicationPlatform>()
  for (const target of targets) {
    const platform = publicationPlatformForTarget(target)
    if (platform) platforms.add(platform)
  }
  return [...platforms]
}
