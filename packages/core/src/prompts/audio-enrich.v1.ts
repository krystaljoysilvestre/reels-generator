// audio-enrich.v1 — the audio enrichment pass. After the script is written, analyze it and draft optional
// audio-direction notes in plain natural language. These are DIRECTING NOTES for the pipeline, not the
// narration: ambience, immersion, tension, transitions, and non-narrator voices. The narration is never
// touched. Output is one short note per line (no brackets, no syntax) — e.g.:
//   School restroom ambience.
//   Door opens softly.
//   Female voice from a nearby stall repeats the narrator's line.
//   Phone vibration when the text message arrives.
//   Low female breathing beside the listener.
//   Short horror sting on the reveal.

import { z } from 'zod'

export const AUDIO_ENRICH_V1_VERSION = 'audio-enrich.v1'

export const AudioEnrichSchema = z.object({
  lines: z.array(z.string().min(1).max(120)).max(10),
})
export type AudioEnrich = z.infer<typeof AudioEnrichSchema>

export function buildAudioEnrichPrompt(params: {
  narration: string
  genre?: string | undefined
}): { system: string; userMessage: string } {
  const system = `You are an audio director for short, narrated vertical videos${params.genre ? ` (${params.genre})` : ''}. You read a finished script and propose OPTIONAL audio that would deepen it — without changing a single word of the narration.

Write audio-direction notes in plain natural language, ONE per line. No brackets, no labels, no timestamps, no special syntax — just a short sentence a sound designer could act on.

Focus on:
- Ambience and immersion (a room tone, a place coming alive).
- Tension and transitions (a swell, a sting, a sudden silence, a shift between beats).
- Non-narrator voices when they fit (someone other than the narrator).

PRIORITIZE moments that would land harder as AUDIO than as narration — things the script tells us but that hit harder when heard: whispers, unseen voices, phone calls, laughter, breathing, announcements, radio chatter, or dialogue from off-screen characters.

Rules:
- Each line is one concrete cue tied to a real moment in THIS script.
- Quality over quantity — only genuinely additive moments. Fewer, stronger notes beat a long list. It's fine to return very few.
- Never restate the narration or instruct the narrator. These are sounds AROUND the narration.
- Keep each line short and plain (a handful of words).`

  const userMessage = `Script (narration — do NOT change it, only design audio around it):
"""${params.narration}"""

Return JSON only: { "lines": ["School restroom ambience.", "Door opens softly.", …] }
Return an empty array if nothing would genuinely add.`

  return { system, userMessage }
}
