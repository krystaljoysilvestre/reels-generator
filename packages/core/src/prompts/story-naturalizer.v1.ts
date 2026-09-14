// story-naturalizer.v1 — FINISHING. Sands residual AI artifacts off an already-human-quality
// script: constructed phrasing, uniform rhythm, template patterns, over-polish. Nothing else.
// Named "Naturalizer", deliberately NOT "Humanizer" — the Writer's output is expected to already
// be human-quality; this stage is mastering, not rescue. The selected creative context protects intentional craft.
//
// Contract: IN narration+peakMoment → OUT narration+peakMoment. Success = the artifacts are gone
// and NOTHING else changed; an unchanged line — or an unchanged script — is a valid, good result.
// Word-count bounds enforced by the CALLER (out-of-bounds → pass discarded).
// Versioned source code; craft version rides along.

import { z } from 'zod'
import { STORY_CRAFT_V1_VERSION, spokenRegisterBlock } from './story-craft.v1.js'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

export const STORY_NATURALIZER_V1_VERSION = `naturalizer.v1.5+${STORY_CRAFT_V1_VERSION}+${STORY_CONTEXT_VERSION}`

export const StoryNaturalizeSchema = z.object({
  narration: z.string().min(1),
  // Keep the given peak line verbatim if untouched, or return the naturalized version of that
  // SAME line. Must be a verbatim substring of the returned narration.
  peakMoment: z.string().min(1),
})
export type StoryNaturalize = z.infer<typeof StoryNaturalizeSchema>

export interface StoryNaturalizerVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  language: string
  audienceDescriptor: string
  narration: string
  peakMoment: string
}

export function buildStoryNaturalizerPrompt(v: StoryNaturalizerVars): { system: string; userMessage: string } {
  const system = `You are a finishing editor. Correct broken language and accidental mechanical phrasing while preserving the selected form and narrator. Read each line aloud as THIS teller for THIS audience; do not turn formal, poetic, documentary or practiced storytelling into casual conversation.

Language: ${v.language}${spokenRegisterBlock(v.language, v.audienceDescriptor)}
${v.creativeContext ? `\n${renderStoryCreativeContext(v.creativeContext)}\n` : ''}
${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}

WHAT YOU REMOVE — the fingerprints:
- Constructed phrasing no one says out loud ("little did I know", a metronome of perfectly balanced clauses, the dramatic one-word sentence used as a formula).
- Uniform rhythm: sentences of near-identical length and skeleton marching in a row — rebuild one so the pattern breaks the way real speech does.
- Accidental templates that flatten this story. Parallelism, mirrored pairs, refrains and an earned named takeaway can be intentional craft; their surface shape alone is never a reason to change them.
- Unsupported or distracting precision; preserve exact facts and purposeful wording, including documentary detail and comic timing. Do not roughen a line just to imitate memory.
- Word choices that do not fit the selected audience or register. Formal, literary and oral-traditional language can be appropriate; do not replace it merely because a friend would speak more casually.
- LITERAL TRANSLATION + BROKEN LANGUAGE (top priority in Taglish/mixed-language scripts): any line that reads like an English sentence built word-for-word in Tagalog, or any garbled/grammatically-wrong phrase, gets re-said the way a real person would actually say it. ("Parang mali na hindi ko masabi kung anong totoo" → "Parang hindi ko na alam kung ano'ng totoo." A meaningless phrase like "bahay na ginagawa namin sa queue" → say plainly what was meant, or cut it.)

WHAT YOU NEVER TOUCH:
- The plot, the events, the structure, the order of beats, the emotional pacing, the point of view.
- DELIBERATE CRAFT that only looks like an artifact: a punchline's engineered word order and the beat before it, a confession's intentional seams and tangents, a planted detail phrased innocently, a repetition that is doing rhythm work. Before re-saying an odd line, ask what job its oddness is doing — if it has one, it's not a fingerprint; leave it.
- Content: you may not add or remove story information — only re-hear a line the way a person would actually say it. Keep the overall length close to the original; a necessary language correction may take a few more words, but do not develop new material.
- The ONE content exception: broken language. If a phrase is garbled, meaningless, or grammatically wrong in the narration language (an actual defect, not a stylistic choice), fixing it to what the person clearly meant is finishing, not rewriting — do it.
- The purposeful line and paragraph formatting, including verse or refrains.
- Any line that already sounds like a person. Most lines should survive untouched — a small diff is success, and an unchanged script is a valid result. If you're improving rather than de-fingerprinting, stop.`

  const userMessage = `Finish this script. Return the full narration.

PEAK LINE (keep verbatim, or return its naturalized version as "peakMoment"; must appear verbatim in your narration): ${v.peakMoment || '(none marked — return the single strongest line as "peakMoment")'}

SCRIPT:
${v.narration}

OUTPUT (JSON only):
{
  "narration": "",
  "peakMoment": ""
}`

  return { system, userMessage }
}
