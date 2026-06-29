// Server-side style suffix injection. The LLM writes content; the system owns style.
// The LLM never sees or modifies the style preset.

export function assembleImagePrompt(
  contentPrompt: string,
  stylePreset: string,
): string {
  // Lead with the style: diffusion models weight earlier tokens more, so putting the
  // medium/style DNA first makes it dominate (otherwise a photographic scene description
  // collapses every look toward realism). The scene content follows.
  return `${stylePreset.trim()}, ${contentPrompt.trim()}, vertical 9:16 composition`
}

export function assembleNegativePrompt(
  opts?: { genreCategory?: string; channelNegativeTerms?: string },
): string {
  const defaults = [
    // Artifacts
    'text', 'watermark', 'logo', 'signature', 'blurry', 'out of focus',
    'duplicate', 'extra limbs', 'deformed', 'ugly', 'bad anatomy',
    // Quality floor (style-neutral — improves any look without biasing the channel's medium)
    'low quality', 'low resolution', 'jpeg artifacts', 'oversaturated', 'overexposed',
    'washed out', 'flat lighting', 'harsh flash', 'amateur', 'stock photo',
    'cropped', 'frame border', 'collage', 'split image',
    // Malformed-architecture artifacts (never wanted in any niche) — the image model otherwise renders
    // doors as a weird double panel / two doors on one hinge / a frame with no door.
    'double door', 'duplicate door', 'deformed door', 'extra door', 'distorted doorway', 'misaligned door',
  ]
  // Content guards. Suppressing gore/violence/nudity is right for most niches, but on a HORROR channel the
  // gore/violence guards fight the genre — they neuter exactly the dread/menace the look is built for, so
  // every reshoot comes back tame. Horror channels drop those two. 'nudity' STAYS for everyone: it adds
  // nothing to dread, and dropping it makes the image model render unclothed figures (a platform-ban risk).
  // OpenAI's own moderation still backstops true NSFW at generation time.
  const contentGuards = opts?.genreCategory === 'horror' ? ['nudity'] : ['gore', 'graphic violence', 'nudity']
  const channel = opts?.channelNegativeTerms ? opts.channelNegativeTerms.split(',').map((s) => s.trim()) : []
  return [...defaults, ...contentGuards, ...channel].join(', ')
}
