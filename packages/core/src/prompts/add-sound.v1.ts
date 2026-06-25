// add-sound.v1 — turn an operator's plain-language request into ONE anchored sound cue for a SPECIFIC
// scene. Used by the per-scene "Add a sound" box (manual cues), distinct from the reel-level smart pass.
//   • quoted/explicit words → kind:'speech' (a second voice says them, e.g. an old woman: "Buti gising ka pa")
//   • otherwise             → kind:'sfx'    (a one-shot sound effect)
// The anchor MUST be an exact substring that appears EXACTLY ONCE in the narration so compute_timings can
// place it. The scene's own text is given so the cue lands within that scene by default.

import { z } from 'zod'

export const ADD_SOUND_V1_VERSION = 'add-sound.v1'

export const AddSoundSchema = z.object({
  kind: z.enum(['sfx', 'speech']),
  anchor: z.string().min(1),
  offsetMs: z.number().int().default(0),
  prompt: z.string().default(''),
  words: z.string().default(''),
  speaker: z.string().default(''),
  delivery: z.string().default(''),
  voiceSearchKeyword: z.string().default(''),
  gender: z.enum(['male', 'female', 'any']).default('any'),
})
export type AddSound = z.infer<typeof AddSoundSchema>

export function buildAddSoundPrompt(params: {
  instruction: string
  sceneText: string
  fullNarration: string
}): { system: string; userMessage: string } {
  const system = `You place ONE sound onto a specific scene of a narrated horror/story reel, from a plain-language request.

Decide the kind:
- "speech" — the request wants specific WORDS spoken/whispered (quoted words, or "saying/whispers that …"). Put the exact words in "words" (strip the quotes — keep them verbatim, including non-English lines like Tagalog), who says them in "speaker", how in "delivery", and a catalog search term + gender to find a fitting voice.
- "sfx" — any non-verbal sound (laugh, cackle, knock, footsteps, whisper texture with no words, "pssst", wind, breathing). Put a vivid short description in "prompt". Leave the speech fields empty.

Anchor — WHERE it plays:
- "anchor" MUST be a short, VERBATIM substring copied from the narration that appears EXACTLY ONCE. Prefer a phrase from THIS scene's text. "at the end" → the scene's last words.
- Never invent text that isn't in the narration. Keep the anchor short (2–6 words) but unique.
- "offsetMs": 0 normally; a small positive value (e.g. 400) to land just after the anchored word.`

  const userMessage = `Full narration (anchors must be exact substrings of THIS):
"""${params.fullNarration}"""

The operator is adding a sound to this scene:
"""${params.sceneText}"""

Request:
"""${params.instruction}"""

Return JSON only:
{ "kind": "sfx"|"speech", "anchor": "verbatim substring", "offsetMs": 0,
  "prompt": "(sfx only) sound description",
  "words": "(speech only) exact words", "speaker": "(speech) who", "delivery": "(speech) how",
  "voiceSearchKeyword": "(speech) catalog search term", "gender": "male"|"female"|"any" }`

  return { system, userMessage }
}
