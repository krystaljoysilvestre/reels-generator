// interpret-sounds.v1 — the hidden realization step. Turns the operator's plain-language audio-direction
// notes (from the Sound design field) into structured, anchored cues the pipeline can render: SFX
// one-shots and short off-screen voice lines, each pinned to a verbatim spot in the narration. The
// operator never sees this — they only write/edit the plain notes.

import { z } from 'zod'

export const INTERPRET_SOUNDS_V1_VERSION = 'interpret-sounds.v1'

export const InterpretedCueSchema = z.object({
  kind: z.enum(['sfx', 'speech', 'ambience', 'silence']),
  anchor: z.string().min(1), // verbatim, unique substring of the narration the cue lands on
  offsetMs: z.number().int().default(0),
  prompt: z.string().default(''), // sfx: the sound description (also used for ambience/stings)
  words: z.string().default(''), // speech: the exact words to speak
  speaker: z.string().default(''), // speech: who, e.g. "old woman"
  delivery: z.string().default(''), // speech: how, e.g. "whisper"
  voiceSearchKeyword: z.string().default(''), // speech: catalog search term for a fitting voice
  gender: z.enum(['male', 'female', 'any']).default('any'),
})
export type InterpretedCue = z.infer<typeof InterpretedCueSchema>

export const InterpretSoundsSchema = z.object({
  cues: z.array(InterpretedCueSchema).max(12),
})

export function buildInterpretSoundsPrompt(params: {
  notes: string
  narration: string
}): { system: string; userMessage: string } {
  const system = `You convert plain-language audio-direction notes into precise, placeable sound cues for a narrated video. Each note becomes at most one cue.

For each note decide the kind:
- "speech" — a NON-narrator voice saying words (off-screen line, overheard voice, phone/radio voice, a voice repeating something). Put the exact words in "words", who in "speaker", how in "delivery", and a catalog search term + gender to find a fitting voice. If the note implies words but doesn't quote them (e.g. "a voice repeats the narrator's line"), write the most fitting short line yourself.
- "ambience" — a CONTINUOUS room tone / environment bed (restroom ambience, rain, market crowd, wind, distant traffic). Put a vivid description in "prompt".
- "sfx" — a one-shot non-verbal sound: footsteps, a door, a phone buzz, a single breath, a sting, a knock. Put a vivid short description in "prompt".
- "silence" — a held pause / drop-out of sound for tension (e.g. "silence before the reveal"). Just set the anchor; no prompt.

Anchor — WHERE it plays:
- "anchor" MUST be a short VERBATIM substring copied from the narration that appears EXACTLY ONCE. Choose the word/phrase the note refers to ("when the text arrives" → the phrase about the text; "on the reveal" → the reveal phrase; ambience → the first line of the relevant section).
- Never invent narration text. Keep anchors short (2–6 words) but unique.
- "offsetMs": usually 0; a small positive value to land just after the anchored word.`

  const userMessage = `Narration (anchors must be exact substrings of THIS):
"""${params.narration}"""

Audio-direction notes (one per line):
"""${params.notes}"""

Return JSON only:
{ "cues": [ { "kind": "sfx"|"speech", "anchor": "verbatim substring", "offsetMs": 0,
  "prompt": "(sfx) description", "words": "(speech) words", "speaker": "(speech) who",
  "delivery": "(speech) how", "voiceSearchKeyword": "(speech) search term", "gender": "male"|"female"|"any" } ] }`

  return { system, userMessage }
}
