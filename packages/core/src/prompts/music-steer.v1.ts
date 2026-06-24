// music-steer.v1 — suggest short, concrete ways to adjust a reel's background music bed.
// The operator opens "Regenerate" on the storyboard's music control and can type a plain-language steer
// ("more tense", "add a slow heartbeat"). To help, we offer a few AI suggestions tailored to THIS story's
// mood + the channel's sonic DNA. Each suggestion is a ready-to-use instruction: it's appended verbatim to
// the Eleven Music prompt (see buildMusicPrompt), so it must read as a directive, not a description.

import { z } from 'zod'

export const MUSIC_STEER_V1_VERSION = 'music-steer.v1'

export const MusicSteerSchema = z.object({
  suggestions: z.array(z.string().min(1).max(80)).min(3).max(4),
})

export function buildMusicSteerPrompt(params: {
  storyTitle: string
  storyExcerpt: string
  moodTags: string[]
  currentBed: string
}): { system: string; userMessage: string } {
  const system = `You direct the background music for short, narrated vertical horror/story reels. Given a story and its current instrumental bed, propose distinct, concrete ways the operator might re-shape the music.

Rules for each suggestion:
- A short imperative directive an audio engine can follow — e.g. "Add a slow, irregular heartbeat", "Strip it back to a single sub-bass drone", "Let dissonant strings swell toward the end". 4–9 words.
- INSTRUMENTAL only — never suggest vocals, lyrics, singing, or chanting (they'd fight the narration).
- It must sit UNDER a speaking voice: no jarring hits, no busy melodies, no big drops.
- Make the set VARIED — vary texture, instrument, tempo/pulse, and dynamics across the suggestions; don't restate the same idea.
- Fit the story's mood. No quotes, no trailing punctuation, no numbering.`

  const userMessage = `Story: "${params.storyTitle}"
Mood: ${params.moodTags.length ? params.moodTags.join(', ') : 'unspecified'}
Excerpt: """${params.storyExcerpt}"""
Current bed: "${params.currentBed}"

Return 3–4 distinct steering directives as JSON: { "suggestions": ["…", "…", "…"] }`

  return { system, userMessage }
}
