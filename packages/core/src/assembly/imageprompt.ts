// Server-side style suffix injection (CLAUDE.md non-negotiable rule 2).
// The LLM writes content; the system owns style.
// The LLM never sees or modifies the style preset.

export function assembleImagePrompt(
  contentPrompt: string,
  stylePreset: string,
  negativeTerms?: string,
): string {
  const base = `${contentPrompt.trim()}, ${stylePreset.trim()}, vertical 9:16 composition`
  return negativeTerms ? base : base
}

export function assembleNegativePrompt(channelNegativeTerms?: string): string {
  const defaults = [
    'text', 'watermark', 'logo', 'signature', 'blurry', 'out of focus',
    'duplicate', 'extra limbs', 'deformed', 'ugly', 'bad anatomy',
    'gore', 'graphic violence', 'nudity',
  ]
  const channel = channelNegativeTerms ? channelNegativeTerms.split(',').map((s) => s.trim()) : []
  return [...defaults, ...channel].join(', ')
}
