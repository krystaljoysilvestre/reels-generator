// channel-sample.v1 — generates ONE complete sample reel narration from a channel's
// (possibly still-being-edited) bible, so the operator can preview the channel's voice
// in step 2 before creating it. Targets the channel's own reel length (targetSeconds)
// and adapts its shape to the niche. Saved as the channel's first reference story.

import { z } from 'zod'

export const CHANNEL_SAMPLE_V1_VERSION = 'channel-sample.v1'

export const ChannelSampleSchema = z.object({
  title: z.string(),
  hook: z.string(), // the opening line (first ~3s)
  script: z.string(), // the FULL narration, sized to the channel's reel length
})
export type ChannelSample = z.infer<typeof ChannelSampleSchema>

export interface ChannelSampleVars {
  name: string
  nicheDescription: string
  language: string
  toneJson: string // JSON-stringified tone config
  worldJson: string // JSON-stringified world bible
  targetSeconds: number // the channel's reel length — the sample should match it
  voiceStyle?: string // delivery style of the lead narrator, if any
  hookHint?: string // target-platform hook convention (shapes the opening line)
}

export function buildChannelSamplePrompt(v: ChannelSampleVars): {
  system: string
  userMessage: string
} {
  const targetWords = Math.round(v.targetSeconds * 2.5) // ~2.5 words/sec narration pace

  const system = `You are the head writer for "${v.name}", a short-form video channel.
Niche: ${v.nicheDescription}

Tone calibration (0–10 scales): ${v.toneJson}
World bible (stay consistent with it):
${v.worldJson}${v.voiceStyle ? `\n\nLead narrator delivery: ${v.voiceStyle}` : ''}

Write in ${v.language}. If the language is Taglish, code-switch the way real speakers actually talk —
Tagalog as the emotional base, English for emphasis and modern objects; never translate idioms literally.
Fictionalize specific real places and people. No anatomical gore.
This is a SAMPLE that demonstrates the channel's voice — make it self-contained and complete.`

  const userMessage = `Write ONE complete sample narration for a ~${v.targetSeconds}-second reel (≈${targetWords} words at natural narration pace). Make it feel like a real reel on this channel — natural length, never padded or cut short.
${v.hookHint ? `\nHOOK STYLE (tailor the opening line to the target platform): ${v.hookHint}\n` : ''}
Shape it to the niche — do NOT force a fiction twist onto a channel that isn't narrative:
- Story / narrative niches: open on a hook (never setting description or a greeting), build with grounded, specific, sensory detail, escalate, and land on an ending that RECONTEXTUALIZES an earlier line (re-heard differently) — not a flat stop.
- Informational niches: open on a hook, deliver 2–4 vivid concrete points, end on a satisfying payoff.
- Persuasive / monologue niches: open on a hook, develop one sharp idea with a concrete example, close on a memorable line.

Craft:
- Use whatever point of view + register the niche naturally wants (first-hand account, retold legend, reported, explainer) — do NOT default to a first-person confession.
- Write it the way it is SPOKEN — short lines, roughly one beat per line — for natural narration cadence.
- Grounded and specific; match the channel's tone and world.

OUTPUT (JSON only):
{
  "title": "",
  "hook": "",      // the opening line
  "script": ""     // the FULL narration, in spoken beats
}`

  return { system, userMessage }
}
