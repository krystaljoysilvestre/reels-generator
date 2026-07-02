// revise-scene.v1 — apply an operator's plain-language change to a scene's IMAGE PROMPT.
// The operator types a casual instruction ("show the old house instead of the door", "make it foggier");
// image models can't follow instructions, so we have the LLM bake the change into a proper, content-only prompt
// that follows the same conventions scenes.v1 produces. The system still owns the style — this only ever
// rewrites the CONTENT (what is seen), never the medium/look.

import { z } from 'zod'

export const REVISE_SCENE_V1_VERSION = 'revise-scene.v1'

// `intent` lets the system silently pick how to regenerate: "refine" = the operator wants to IMPROVE or
// ADJUST the same scene, so we keep the existing composition and apply the change off the current image
// (image-to-image). "replace" = the operator wants a fundamentally DIFFERENT scene (new subject / place /
// shot), so we re-roll from scratch (text-to-image). Getting this right is the whole UX: a misread refine
// re-rolls a scene the operator only wanted tweaked; a misread replace barely changes one they wanted
// reimagined.
export const ReviseSceneSchema = z.object({
  imagePrompt: z.string().min(1),
  intent: z.enum(['refine', 'replace']),
})

export function buildReviseScenePrompt(
  currentPrompt: string,
  instruction: string,
  opts?: { genreCategory?: string },
): { system: string; userMessage: string } {
  // Horror channels need the fear rendered as CONCRETE physical wrongness — the image model only draws what
  // is literally described, so a mild adjective ("creepy", "unsettling grin") renders as a pretty, normal
  // face. Force the rewrite to name visible anatomy/detail wrongness instead of the feeling.
  const horrorClause =
    opts?.genreCategory === 'horror'
      ? `

This is a HORROR channel. When the change asks for something frightening, uncanny, or "creepy", do NOT settle for mood adjectives ("eerie", "unsettling", "a creepy smile") — the image model renders only concrete detail, so vague fear-words come out pretty and normal. Translate the fear into specific, visible WRONGNESS: a smile stretched unnaturally past the corners of the mouth baring too many teeth, eyes open too wide in a dead unblinking stare, bloodless waxy skin, a head or limb at a subtly wrong angle, a reflection that doesn't match the body, a figure half-swallowed by shadow. Name the physical detail, never just the feeling. Keep it genuinely disturbing — do not soften it into something tasteful or beautiful.`
      : ''
  const system = `You are a storyboard director for vertical (9:16) narrated reels. You revise ONE scene's image prompt.

An image prompt is CONTENT ONLY — it describes WHAT IS SEEN. Never include style or medium words ("cinematic", "photo", "painting", colour-grade or lens terms); the system owns the look. Lead with the key VISIBLE subject, then shot size + camera angle, one foreground element for depth, the light source + its direction, a touch of atmosphere. Use concrete nouns and a plain present-tense description of the frame — never meta-instructions like "show", "change", "instead", "make it". ~30–50 words.

DESCRIBE PRESENCE, NOT ABSENCE. Only ever state what IS in the frame, never what is missing. The image model reads "no sink", "without a mirror" or "strictly no X" as a cue to DRAW that very thing — so when the operator asks to remove or keep out something, never echo it as a negation. Instead describe what fills that space so there is no room left for the unwanted thing (e.g. "no sink, just the stall walls" → "tight tiled partition walls press in close on the left and right, boxing in the narrow cubicle"). Your output must contain no "no", "not", "without", "avoid" or "remove".${horrorClause}`

  const userMessage = `Current image prompt:
"""${currentPrompt}"""

The operator wants this change:
"""${instruction}"""

FIRST decide the intent. The dividing line is PHYSICAL: "refine" re-touches the existing image in place (image-to-image — it can only recolour / relight / add atmosphere to what is ALREADY in the frame; it CANNOT move the camera or restage the shot). "replace" renders the shot fresh from the description.

"refine" — ONLY a non-spatial look change. The camera, viewpoint, framing, subject and layout stay byte-for-byte the same; just the look shifts. This is the narrow case:
  • colour / grade / mood — "colder", "warmer", "more saturated", "sepia"
  • light level / source — "darker", "lights off", "add a candle glow", "moonlight"
  • weather / atmosphere — "more fog", "rain", "hazier", "smoke"
  • film qualities — "more grain", "sharper", "more cinematic", "softer focus"

"replace" — ANY change to WHAT the camera sees or WHERE it is. Realizing it means the camera or the layout moves, so it must render fresh:
  • viewpoint / POV / angle / framing / distance — "POV looking at the door", "from behind her", "the view should be the back of the door", "wider", "low angle", "over the shoulder", "closer"
  • subject — "show the knife instead", "her face instead of the room"
  • location — "make it a forest", "move to the church", "outside looking in"
  • adding / removing a MAJOR element or otherwise restaging the scene
  • introducing a NEW person, figure, or creature not already in the frame — "add a woman behind her", "someone in the mirror", "a figure in the doorway", "the ghost appears beside her". A refine can only relight what is ALREADY there, so it can NEVER add someone — describing or adding a new subject is ALWAYS replace.
  Phrases like "POV", "the view should be…", "show…", "see…", "from…", "add…", "beside…", "behind…" almost always mean replace.

When it's genuinely ambiguous, choose "replace" — a fresh render that follows the description is what the operator expects; refine can only recolour what is already there, so a misjudged refine looks like "nothing changed but the colours".

THEN rewrite the FULL image prompt with the change fully applied:
- For "refine": keep everything the operator did not mention; fold the change in.
- For "replace": re-describe the frame for the NEW shot. Keep the SAME location/world details the scene already established (it's still the same place unless they moved it) but recompose around the new viewpoint/subject — and drop whatever the new shot no longer shows. E.g. a "POV of the back of the cubicle door" keeps the cubicle but now leads with the door filling the frame from inside, not the person who was the old subject.
- Content only, no style/medium words (the system owns the look). Lead with the key visible subject. ~30–50 words.

OUTPUT (JSON only): { "imagePrompt": "the rewritten prompt", "intent": "refine" | "replace" }`

  return { system, userMessage }
}
