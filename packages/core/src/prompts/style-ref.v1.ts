// style-ref.v1 — turns operator-uploaded REFERENCE IMAGE(S) into the channel's
// visual style DNA. A vision pass studies the image(s) and captures their SHARED
// *style* (medium, lighting, palette, texture, mood) as reusable DNA the text-to-image
// pipeline can apply to new scenes — NOT the specific subjects in the images. The
// route attaches the image content blocks; this builds the system + text instruction.

import { z } from 'zod'

export const STYLE_REF_V1_VERSION = 'style-ref.v1'

export const StyleRefSchema = z.object({
  label: z.string(),       // SHORT recognizable medium name (1–2 words), e.g. "Anime", "Oil painting"
  description: z.string(), // ONE plain-English sentence describing the look
  stylePreset: z.string(), // 80–100-word comma-separated visual DNA, medium-first
})
export type StyleRef = z.infer<typeof StyleRefSchema>

export interface StyleRefVars {
  nicheDescription: string
  toneJson: string // JSON-stringified tone config — mood only
}

export function buildStyleRefPrompt(v: StyleRefVars): { system: string; userMessage: string } {
  const system = `You are an art director. The operator uploaded reference image(s) that capture the
visual style they want for their short-form video channel. Study the image(s) and distill their
SHARED visual style into reusable DNA that an image model can apply to BRAND-NEW scenes.

Rules:
- Describe only the STYLE, never the specific subjects/objects/people in the images — so it transfers
  to other scenes. (e.g. "grainy 1990s VHS look", not "a man holding a lamp".)
- Capture: medium/technique, lighting, color palette, texture, framing feel, mood. START with the
  explicit medium (e.g. "flat cel-shaded anime illustration", "grainy 35mm film photograph",
  "inked comic-book panel", "loose watercolor illustration").
- If the look is NON-photographic, include "illustration, not a photograph" and avoid photographic
  words (35mm, photo, depth of field). If it IS photographic, photographic terms are fine.
- Be faithful to what's actually in the image(s); use the niche/mood only to resolve ambiguity, not
  to override the reference.`

  const userMessage = `NICHE: ${v.nicheDescription}
MOOD (tone axes 0–10, for tie-breaking only): ${v.toneJson}

The operator's reference image(s) are attached. Capture their shared visual style.

Return JSON only:
{
  "label": "SHORT recognizable medium name, 1–2 words, no slash/dash (e.g. 'Anime', 'Oil painting')",
  "description": "ONE plain-English sentence describing the look — no jargon",
  "stylePreset": "80–100 words of comma-separated VISUAL descriptors, medium first, STYLE ONLY (no specific subjects from the images)"
}

No prose, no code fences.`

  return { system, userMessage }
}
