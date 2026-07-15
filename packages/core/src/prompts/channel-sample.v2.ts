// channel-sample.v2 — generates ONE complete sample reel narration from a channel's
// (possibly still-being-edited) bible, so the operator can preview the channel's voice
// in step 2 before creating it. Saved as the channel's first reference story — which is exactly
// why it now shares the SAME identity + craft core as the real Writer (story.v2): the preview
// must sound like what the channel will actually produce, and the two can never drift apart.
// v1 stays untouched for shipped channels.

import { z } from 'zod'
import { STORY_CRAFT_CORE, STORY_CRAFT_V1_VERSION, taglishRegisterBlock } from './story-craft.v1.js'
import { WRITER_IDENTITIES, renderIdentity, WRITER_IDENTITIES_V1_VERSION } from './writer-identities.v1.js'
import { asGenreModule, classifyGenre } from './scenes.v1.js'

export const CHANNEL_SAMPLE_V2_VERSION = `channel-sample.v2.0+${STORY_CRAFT_V1_VERSION}+${WRITER_IDENTITIES_V1_VERSION}`

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
  genreCategory?: string | undefined // channel bucket → picks the writer identity (niche keywords as fallback)
  voiceStyle?: string // delivery style of the lead narrator, if any
  hookHint?: string // target-platform hook convention (shapes the opening line)
  promptHint?: string // optional operator steer for what THIS sample should be about
}

export function buildChannelSamplePrompt(v: ChannelSampleVars): {
  system: string
  userMessage: string
} {
  const targetWords = Math.round(v.targetSeconds * 2.5) // ~2.5 words/sec narration pace
  const identity = WRITER_IDENTITIES[asGenreModule(v.genreCategory ?? null) ?? classifyGenre(v.nicheDescription)]

  const system = `You are ${identity.label} — the writer behind "${v.name}", a short-form video channel.
Niche: ${v.nicheDescription}

${renderIdentity(identity)}

${STORY_CRAFT_CORE}

Tone calibration (0–10 scales): ${v.toneJson}
World bible (stay consistent with it):
${v.worldJson}${v.voiceStyle ? `\n\nLead narrator delivery: ${v.voiceStyle}` : ''}

Language for this sample: ${v.language}${taglishRegisterBlock(v.language, 'young Filipino adult')}

GUARDS: fictionalize specific real places and people; no graphic gore or sexual content; never harm to minors as subject matter; original work only.
This is a SAMPLE that demonstrates the channel's voice — make it self-contained and complete. It becomes the channel's first reference story, so every future story learns its voice from this one.`

  const userMessage = `Write ONE complete sample narration for a ~${v.targetSeconds}-second reel (≈${targetWords} words at natural narration pace). Make it feel like a real reel on this channel — natural length, never padded or cut short.
${v.promptHint ? `\nOPERATOR'S DIRECTION FOR THIS ONE: ${v.promptHint}\nHonor whatever they specified — topic, characters, tone, structure, setting, ending — and freely invent everything they left out. A few words is a seed, not a limit; don't pad a sparse idea with filler, and don't treat a detailed brief as optional. Always keep the channel's niche, tone, and world.\n` : ''}${v.hookHint ? `\nHOOK STYLE (tailor the opening line to the target platform): ${v.hookHint}\n` : ''}
Craft:
- Open on a hook (never setting description or a greeting); build with grounded, specific detail; land on an ending that pays off something planted earlier — whatever paying off means in this niche.
- Use whatever point of view + register this story naturally wants (first-hand account, retold to a friend, reported, explainer) — choose what serves it, not a default.
- Write it the way it is SPOKEN — short lines, roughly one beat per line — for natural narration cadence.

OUTPUT (JSON only):
{
  "title": "",
  "hook": "",      // the opening line
  "script": ""     // the FULL narration, in spoken beats
}`

  return { system, userMessage }
}
