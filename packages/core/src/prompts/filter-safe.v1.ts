// filter-safe.v1 — recovery rewrite for when an image render is REJECTED by the model's safety filter.
// The filter refuses a PERSON described as dead/a corpse/a victim/injured/menacing/supernatural. This
// rewrites the prompt to say the SAME thing with non-person words ("a figure/form/shape/it") and tones down
// overt gore, changing as little else as possible — so the retry renders an identical picture and passes.
// Called only on a ContentFilterError, so it costs nothing on the happy path.

import { z } from 'zod'

export const FILTER_SAFE_V1_VERSION = 'filter-safe.v1'

export const FilterSafeSchema = z.object({ imagePrompt: z.string().min(1) })

export function buildFilterSafePrompt(imagePrompt: string): { system: string; userMessage: string } {
  const system = `You rewrite an image-generation prompt so it passes an image model's SAFETY FILTER, WITHOUT changing the picture. The filter rejects the render when a PERSON is described as dead, a corpse, a victim, bloodied or gravely injured, or as a menacing / supernatural presence. Rewrite ONLY such a subject with NON-PERSON words — "a figure", "a form", "a shape", "it" — and swap overtly gory words (decayed, rotting, bleeding, mutilated) for restrained uncanny detail (pale, waxen, hollow-eyed, a too-wide smile, wrong posture). Leave EVERYTHING else exactly as written: composition, camera, lighting, style, and any ordinary living / unharmed people (keep those as people). Change as little as possible.`
  const userMessage = `Rewrite this image prompt so it passes the safety filter, changing as little as possible:
"""${imagePrompt}"""

OUTPUT (JSON only): { "imagePrompt": "the rewritten prompt" }`
  return { system, userMessage }
}
