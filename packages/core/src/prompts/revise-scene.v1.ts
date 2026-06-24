// revise-scene.v1 — apply an operator's plain-language change to a scene's IMAGE PROMPT.
// The operator types a casual instruction ("show the old house instead of the door", "make it foggier");
// flux can't follow instructions, so we have the LLM bake the change into a proper, content-only prompt
// that follows the same conventions scenes.v1 produces. The system still owns the style — this only ever
// rewrites the CONTENT (what is seen), never the medium/look.

import { z } from 'zod'

export const REVISE_SCENE_V1_VERSION = 'revise-scene.v1'

// `intent` lets the system silently pick how to regenerate: a small additive tweak keeps the existing
// composition (image-to-image refine), a subject/framing swap re-rolls from scratch (text-to-image).
export const ReviseSceneSchema = z.object({
  imagePrompt: z.string().min(1),
  intent: z.enum(['refine', 'replace']),
})

export function buildReviseScenePrompt(
  currentPrompt: string,
  instruction: string,
): { system: string; userMessage: string } {
  const system = `You are a storyboard director for vertical (9:16) narrated reels. You revise ONE scene's image prompt.

An image prompt is CONTENT ONLY — it describes WHAT IS SEEN. Never include style or medium words ("cinematic", "photo", "painting", colour-grade or lens terms); the system owns the look. Lead with the key VISIBLE subject, then shot size + camera angle, one foreground element for depth, the light source + its direction, a touch of atmosphere. Use concrete nouns and a plain present-tense description of the frame — never meta-instructions like "show", "change", "instead", "make it". ~30–50 words.`

  const userMessage = `Current image prompt:
"""${currentPrompt}"""

The operator wants this change:
"""${instruction}"""

Rewrite the FULL image prompt with the change fully applied, then return it. Rules:
- If the change swaps the subject or framing (e.g. "show the old house instead of the door"), REPLACE the old subject completely — do not keep describing what was removed. Set "intent" to "replace".
- If it's an additive tweak (e.g. "more fog", "lights off"), keep the rest of the scene and fold the change in. Set "intent" to "refine".
- Keep anything the operator did not ask to change.
- Content only, no style words. Lead with the key visible subject. ~30–50 words.

OUTPUT (JSON only): { "imagePrompt": "the rewritten prompt", "intent": "refine" | "replace" }`

  return { system, userMessage }
}
