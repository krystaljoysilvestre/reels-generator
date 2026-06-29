// Server-side style suffix injection. The LLM writes content; the system owns style.
// The LLM never sees or modifies the style preset.

export function assembleImagePrompt(
  contentPrompt: string,
  stylePreset: string,
): string {
  // Lead with the style DNA so the medium/look frames how the scene is read, then the scene content.
  // (Aspect is set by the image API, so no orientation suffix is needed.)
  return `${stylePreset.trim()}, ${contentPrompt.trim()}`
}

export function assembleNegativePrompt(
  opts?: { genreCategory?: string; channelNegativeTerms?: string },
): string {
  // gpt-image-1 has no negative_prompt field — these are folded into the prompt as an "Avoid:" clause.
  // Keep the list SHORT and intentional: a long avoid-list dilutes the real prompt and can ironically
  // surface the negated nouns. We drop the whole flux-era artifact/anatomy/quality-floor/double-door
  // catalog (those were flux failure modes; gpt-image-1 doesn't make them) and keep only what genuinely
  // helps: an on-image-text guard plus the content guards.
  const defaults = ['text', 'watermark', 'caption', 'subtitles']
  // Content guards. Suppressing gore/violence/nudity is right for most niches, but on a HORROR channel the
  // gore/violence guards fight the genre — they neuter exactly the dread/menace the look is built for, so
  // every reshoot comes back tame. Horror channels drop those two. 'nudity' STAYS for everyone: it adds
  // nothing to dread, and dropping it risks unclothed figures (a platform-ban risk).
  // OpenAI's own moderation still backstops true NSFW at generation time.
  const contentGuards = opts?.genreCategory === 'horror' ? ['nudity'] : ['gore', 'graphic violence', 'nudity']
  const channel = opts?.channelNegativeTerms ? opts.channelNegativeTerms.split(',').map((s) => s.trim()) : []
  return [...defaults, ...contentGuards, ...channel].join(', ')
}
