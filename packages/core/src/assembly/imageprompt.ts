// Server-side style suffix injection (CLAUDE.md non-negotiable rule 2).
// The LLM writes content; the system owns style.
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

export function assembleNegativePrompt(channelNegativeTerms?: string): string {
  const defaults = [
    // Artifacts / safety
    'text', 'watermark', 'logo', 'signature', 'blurry', 'out of focus',
    'duplicate', 'extra limbs', 'deformed', 'ugly', 'bad anatomy',
    'gore', 'graphic violence', 'nudity',
    // Quality floor (style-neutral — improves any look without biasing the channel's medium)
    'low quality', 'low resolution', 'jpeg artifacts', 'oversaturated', 'overexposed',
    'washed out', 'flat lighting', 'harsh flash', 'amateur', 'stock photo',
    'cropped', 'frame border', 'collage', 'split image',
  ]
  const channel = channelNegativeTerms ? channelNegativeTerms.split(',').map((s) => s.trim()) : []
  return [...defaults, ...channel].join(', ')
}
