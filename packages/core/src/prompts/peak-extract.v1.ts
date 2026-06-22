// peak-extract.v1 — pull the dramatic PEAK line out of an existing story body.
//
// Generated stories get a peakMoment natively from generate_story (story.v1 → twist_anchor). BYO /
// user-provided stories never run through that, so they have no peak — which silently degrades two
// things: the climax doesn't get its own scene (breakdown_scenes), and the music swell/sting falls back
// to a generic 0.8×duration mark instead of the real beat (compute_timings). breakdown_scenes runs this
// when a story has no peak yet, then persists the result to twist_anchor so both consumers benefit.

import { z } from 'zod'

export const PEAK_EXTRACT_V1_VERSION = 'peak-extract.v1'

export const PeakExtractSchema = z.object({
  // The single most dramatic line — MUST be a verbatim substring of the narration (caller re-verifies).
  peakMoment: z.string().min(1),
})
export type PeakExtract = z.infer<typeof PeakExtractSchema>

export function buildPeakExtractPrompt(narration: string): { system: string; userMessage: string } {
  const system = `You find the single dramatic PEAK of a short narrated story — the line where the tension, fear, or emotional turn lands hardest (the twist, the reveal, the scare, the gut-punch). This anchors where the music swells and which beat gets its own shot, so it must be the true high point, not the setup or the wind-down.`

  const userMessage = `From the narration below, return the ONE sentence (or short clause) that is its dramatic peak.

Rules:
- It MUST be an EXACT, verbatim substring of the narration — copy-paste it character-for-character. No paraphrase, no "…", no added or removed punctuation, no translation.
- Return ONE concise line, not a paragraph. If the peak sits inside a sentence, return that whole sentence.
- Pick the moment of greatest tension or turn — not the opening setup, not the closing reflection.

Narration:
"""${narration}"""

Output JSON only: { "peakMoment": "the exact line, copied verbatim" }`

  return { system, userMessage }
}
