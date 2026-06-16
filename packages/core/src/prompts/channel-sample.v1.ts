// channel-sample.v1 — generates ONE short sample reel narration from a channel's
// (possibly still-being-edited) bible, so the operator can preview the channel's
// voice in step 2 before creating it. This is a throwaway preview, not a saved reel.

import { z } from 'zod'

export const CHANNEL_SAMPLE_V1_VERSION = 'channel-sample.v1'

export const ChannelSampleSchema = z.object({
  title: z.string(),
  hook: z.string(), // the opening line (first ~3s)
  script: z.string(), // full sample narration (~70–100 words)
})
export type ChannelSample = z.infer<typeof ChannelSampleSchema>

export interface ChannelSampleVars {
  name: string
  nicheDescription: string
  language: string
  toneJson: string // JSON-stringified tone config
  worldJson: string // JSON-stringified world bible
  voiceStyle?: string // delivery style of the lead narrator, if any
}

export function buildChannelSamplePrompt(v: ChannelSampleVars): {
  system: string
  userMessage: string
} {
  const system = `You are the head writer for "${v.name}", a short-form video channel.
Niche: ${v.nicheDescription}

Tone calibration (0–10 scales): ${v.toneJson}
World bible (stay consistent with it):
${v.worldJson}${v.voiceStyle ? `\n\nLead narrator delivery: ${v.voiceStyle}` : ''}

Write in ${v.language}. Fictionalize specific real places and people. No anatomical gore.
This is a SAMPLE to demonstrate the channel's voice — keep it self-contained.`

  const userMessage = `Write one short sample narration for a ~25–30 second reel (about 70–100 words).

Requirements:
- HOOK: the first line opens mid-tension or with an unresolvable detail — never with setting description or a greeting.
- Grounded, sensory, specific; match the channel's tone and world.
- End on a small twist or a lingering image, not a flat stop.

OUTPUT (JSON only):
{
  "title": "",
  "hook": "",
  "script": ""
}`

  return { system, userMessage }
}
