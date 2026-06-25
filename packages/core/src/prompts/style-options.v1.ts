// style-options.v1 — proposes a content-safe sample scene + 4–5 visual styles for
// a channel, chosen from a palette of RECOGNIZABLE art styles (anime, comic, oil
// painting, 3D, etc.). The model curates on MERIT — which mediums best serve the
// niche's mood/audience and render distinctively — grounded on the niche + mood, NOT
// on any pre-set "default look". No bias toward photorealism. Each style is tuned to
// the niche and gets a plain-English "why it fits".

import { z } from 'zod'

export const STYLE_OPTIONS_V1_VERSION = 'style-options.v1'

// Recognizable style palette the model curates from. Not exhaustive — the model may
// blend or qualify a style for the niche (e.g. "Anime — muted palette"), but labels
// must stay anchored to names a layperson recognizes. Order here implies NO preference.
export const STYLE_PALETTE = [
  'Cinematic / Photoreal (live-action film still)',
  'Anime (Japanese cel animation)',
  'Manga / Ink (black-and-white or limited-color line art)',
  'Comic book / Graphic novel (bold inks, halftone, Western comics)',
  '3D animated (Pixar / DreamWorks-style render)',
  'Oil painting / Painterly (classical, textured brushwork)',
  'Watercolor / Storybook illustration (soft, hand-painted)',
  'Flat vector / Cartoon (clean modern flat illustration)',
  'Woodcut / Folk print (traditional relief print, etching)',
  'Retro / VHS analog (degraded 1980s–90s video/photo)',
  'Claymation / Stop-motion (tactile sculpted look)',
  'Concept art / Digital matte painting (cinematic illustration)',
] as const

export const StyleOptionSchema = z.object({
  label: z.string(),       // 1–3 word niche-flavored look, e.g. "Case-File Noir", "Vintage Engraving", "Meme Style"
  description: z.string(), // ONE plain-English sentence: why this style fits THIS channel — no technical jargon
  stylePreset: z.string(), // 80–100-word comma-separated visual DNA: this niche rendered in this style
})
export type StyleOption = z.infer<typeof StyleOptionSchema>

export const StyleOptionsSchema = z.object({
  // A depictable, NON-GRAPHIC scene used to preview every style (same scene, different style).
  sampleScene: z.string(),
  styles: z.array(StyleOptionSchema).min(4).max(5),
})
export type StyleOptions = z.infer<typeof StyleOptionsSchema>

export interface StyleOptionsVars {
  nicheDescription: string
  worldJson: string        // JSON-stringified world bible (region/era/etc.)
  toneJson: string         // JSON-stringified tone config — MOOD only (emotional register), not a medium
  sampleScript?: string    // optional Step-2 narration the scene should be drawn from
}

export function buildStyleOptionsPrompt(v: StyleOptionsVars): { system: string; userMessage: string } {
  const system = `You are an art director choosing the visual look for a short-form video channel.
From a palette of well-known art styles, you pick the few that genuinely serve the channel and tune
each one to it, plus one representative scene to preview them on.

Rules:
- Pick on MERIT: choose the 4–5 mediums that best serve THIS niche's mood and audience AND that an
  image model renders distinctively and reliably. Do NOT default to photorealism — for many niches a
  bold stylized medium (comic, manga, woodcut, painting, anime, 3D…) reads as more intentional and
  recognizable than generic AI photorealism, which often looks flat or uncanny. Judge each niche on
  its own merits: some genuinely call for photoreal, many don't. Never assume a fixed niche→style
  mapping; reason from the niche + mood each time.
- The 4–5 must be GENUINELY DIFFERENT looks (a real range), not variations of one — span the spectrum:
  realism/cinematic, animation/illustration, AND at least one niche-specific or local-flavor look.
  Order best-fit FIRST — the first is the recommended default, picked on merit (not reflexively photoreal).
- Labels are SHORT, evocative looks tuned to THIS niche (1–3 words) — combine a medium/treatment WITH the
  niche's flavor so each reads as "a look for this channel", not a generic art-class term. Vary them per
  niche, e.g. true-crime → "Case-File Noir", "Evidence Board", "Docu-Realism"; cooking → "Bright Studio",
  "Rustic Film"; history → "Vintage Engraving", "Sepia Archive"; comedy → "Pixar Style", "Meme Style";
  horror → "Cinematic Horror", "Found Footage". Recognizable at a glance, no jargon — the "why it fits"
  line carries the rest.
- Each style's "stylePreset" is the technical DNA that renders THIS niche IN THAT style — so the same
  niche looks distinctly anime vs. oil-painting vs. photoreal across the options. The DNA MUST begin
  with the explicit medium phrase (e.g. "flat cel-shaded anime illustration", "classical oil painting
  with thick impasto brushwork", "inked comic-book panel with halftone", "hand-painted watercolor
  storybook illustration") so the renderer commits to the medium, not realism.
- For any NON-photographic style, add anti-realism cues ("illustration, not a photograph") and do NOT
  use photographic words ("35mm", "photo", "photorealistic", "depth of field", "film grain") —
  reserve those for the Cinematic / Photoreal option only.
- The sample scene is what every style is previewed on, so it must be DEPICTABLE and SAFE for an
  image model: atmospheric and evocative, never graphic — no gore, no violence, no injury, no
  nudity, no minors in peril. Imply mood through light, place, weather, and objects.
- Pick the single moment that best captures THIS channel's signature feel at its strongest — whatever
  that feel is for the niche (eerie, cozy, tense, awe-struck, playful…). Lean into the niche's own mood,
  don't flatten it to a neutral establishing shot; but never tip into the graphic payoff. Be genre-true,
  not genre-biased.`

  const userMessage = `NICHE: ${v.nicheDescription}
WORLD: ${v.worldJson}
MOOD (tone axes 0–10 — infer the emotional register only; this is NOT a medium and must not be turned into a photographic look): ${v.toneJson}
${v.sampleScript ? `SAMPLE NARRATION (draw the scene from this):\n${v.sampleScript}` : 'No sample narration — invent a representative scene from the niche/world.'}

STYLE PALETTE (choose from these; qualify for the niche as needed; the order below implies no preference):
${STYLE_PALETTE.map((s) => `- ${s}`).join('\n')}

Return JSON only:
{
  "sampleScene": "one depictable, non-graphic scene (content only — what to show; no style words). If sample narration is given, pick the single MOST mood-defining moment from it — the beat that best captures the channel's feel (eerie/cozy/tense/awe…), still safe and non-graphic; else invent one true to the niche/world.",
  "styles": [
    {
      "label": "1–3 word evocative look tuned to THIS niche (e.g. 'Case-File Noir', 'Vintage Engraving', 'Bright Studio', 'Dark Anime', 'Pixar Style', 'Meme Style') — niche-flavored and recognizable, no jargon",
      "description": "ONE plain-English sentence on why this style fits THIS channel — no technical jargon",
      "stylePreset": "80–100 words of comma-separated VISUAL descriptors for an image model. START with the explicit medium phrase (e.g. 'flat cel-shaded anime illustration', 'cinematic photoreal film still'), THEN technique, color palette, texture, mood, and lighting QUALITY (contrast/softness) — this niche rendered in this look. Do NOT fix a time of day or light level (no 'night', 'daylight', 'low-light', 'moonlight') — each scene sets its own lighting, so the style must work in both day and night. For non-photographic styles include 'illustration, not a photograph' and avoid photographic words. Style DNA only, no story content."
    }
    // 4 or 5 GENUINELY DIFFERENT looks tuned to the niche — span realism/cinematic, animation/illustration,
    // and a niche-specific/local look — ordered best-fit FIRST (the first is the recommended default, on merit).
  ]
}

No prose, no code fences.`

  return { system, userMessage }
}
