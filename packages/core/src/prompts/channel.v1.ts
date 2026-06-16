// channel.v1 — channel-bible derivation template.
// Given a name + niche description + languages, Claude designs the channel's
// creative profile (tone, visual style DNA, world bible). Voices are NOT derived.
// Versioned source code. Never edit after a channel ships on this version — bump to v2.

import { z } from 'zod'
import { ToneConfigSchema, WorldBibleSchema } from '../types/channel.js'

export const CHANNEL_V1_VERSION = 'channel.v1'

// The full derived profile returned by the LLM. Narrator voices are NOT derived
// — the operator picks real ElevenLabs voices in the UI. Audio packs + LUT files
// reference real assets we don't have for an arbitrary niche, so they're later.
export const ChannelDerivationSchema = z.object({
  tagline: z.string(), // one-line positioning
  toneConfig: ToneConfigSchema,
  stylePreset: z.string(), // ~80–100 word visual style DNA for image prompts
  worldBible: WorldBibleSchema,
  voiceSearchKeyword: z.string(), // 1–2 word genre/topic tag for matching narrator voices
})
export type ChannelDerivation = z.infer<typeof ChannelDerivationSchema>

export interface ChannelDerivationVars {
  name: string
  nicheDescription: string
  languages: string[]
}

export function buildChannelDerivationPrompt(v: ChannelDerivationVars): {
  system: string
  userMessage: string
} {
  const system = `You are a show-runner who designs the creative bible for short-form video channels.
Given a channel name, a niche description, and target languages, you produce a coherent, production-ready bible that a writing + image-generation pipeline can use to make consistent videos.

Principles:
- Be specific and opinionated. Vague bibles produce generic videos. Invent concrete, evocative detail that fits the niche.
- Stay internally consistent: tone, visual style, and world should feel like one channel.
- Fictionalize specifics so nothing maps to a real person or exact real place; a real region/era is fine.`

  const userMessage = `Design the creative bible for this channel.

CHANNEL NAME: ${v.name}
NICHE: ${v.nicheDescription}
LANGUAGES: ${v.languages.join(', ')}

Produce JSON with exactly these fields:

{
  "tagline": "one vivid sentence positioning the channel",
  "toneConfig": {
    "suspense": 0-10, "dread": 0-10, "pacing": 0-10, "gore": 0-10, "humor": 0-10
  },
  "stylePreset": "80–100 words of comma-separated VISUAL style descriptors for an image model: film stock/medium, lighting, era/place, color palette, framing (vertical 9:16), texture, mood. This is style DNA only — no story content, no characters.",
  "worldBible": {
    "region": "a real-but-fictionalized region/setting",
    "era": "time period the channel lives in",
    "canonLocations": ["3–5 recurring named places"],
    "canonObjects": ["3–5 recurring evocative objects"],
    "vocabulary": { "term": "how this channel refers to it (2–5 entries)" }
  },
  "voiceSearchKeyword": "1–2 word genre/topic tag for finding fitting narrator voices, e.g. 'horror', 'true crime', 'motivation', 'meditation'"
}

Output JSON only. No prose, no code fences.`

  return { system, userMessage }
}
