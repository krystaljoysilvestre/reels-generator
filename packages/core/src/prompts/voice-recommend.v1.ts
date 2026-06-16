// voice-recommend.v1 — picks the best-fitting real TTS voices for a channel from
// the available catalog, given its niche, language, and tone. Returns voice ids
// (must be from the catalog) + a one-line reason each.

import { z } from 'zod'

export const VOICE_RECOMMEND_V1_VERSION = 'voice-recommend.v1'

export const VoiceRecommendationSchema = z.object({
  recommendations: z
    .array(z.object({ id: z.string(), reason: z.string() }))
    .min(1)
    .max(6),
})
export type VoiceRecommendation = z.infer<typeof VoiceRecommendationSchema>

export interface VoiceCatalogEntry {
  id: string
  name: string
  gender: string
  accent: string
  description: string
}

export interface VoiceRecommendVars {
  nicheDescription: string
  language: string
  toneJson: string
  catalog: VoiceCatalogEntry[]
}

export function buildVoiceRecommendPrompt(v: VoiceRecommendVars): {
  system: string
  userMessage: string
} {
  const catalog = v.catalog
    .map((c) => `- id:${c.id} | ${c.name} | ${c.gender} | ${c.accent || 'unknown'} accent | ${c.description}`)
    .join('\n')

  const system = `You match real text-to-speech voices to a short-form video channel.
You will be given a channel's niche, narration language, tone, and a CATALOG of available voices.
Pick the 3–5 voices that best fit — judging by delivery/character against the niche + tone, and by suitability for the language (note: all voices are multilingual-capable, so weigh accent only as a soft factor).
Only choose ids that appear in the catalog. Order best-first.`

  const userMessage = `NICHE: ${v.nicheDescription}
LANGUAGE: ${v.language}
TONE (0–10): ${v.toneJson}

CATALOG:
${catalog}

Return JSON only:
{
  "recommendations": [
    { "id": "<catalog id>", "reason": "<one short sentence on why it fits>" }
  ]
}`

  return { system, userMessage }
}
