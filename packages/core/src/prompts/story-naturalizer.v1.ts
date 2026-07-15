// story-naturalizer.v1 — FINISHING. Sands residual AI artifacts off an already-human-quality
// script: constructed phrasing, uniform rhythm, template patterns, over-polish. Nothing else.
// Named "Naturalizer", deliberately NOT "Humanizer" — the Writer's output is expected to already
// be human-quality; this stage is mastering, not rescue. Genre-blind by design.
//
// Contract: IN narration+peakMoment → OUT narration+peakMoment. Success = the artifacts are gone
// and NOTHING else changed; an unchanged line — or an unchanged script — is a valid, good result.
// Word-count bounds enforced by the CALLER (out-of-bounds → pass discarded).
// Versioned source code; craft version rides along.

import { z } from 'zod'
import { STORY_CRAFT_V1_VERSION, spokenRegisterBlock } from './story-craft.v1.js'

export const STORY_NATURALIZER_V1_VERSION = `naturalizer.v1.3+${STORY_CRAFT_V1_VERSION}`

export const StoryNaturalizeSchema = z.object({
  narration: z.string().min(1),
  // Keep the given peak line verbatim if untouched, or return the naturalized version of that
  // SAME line. Must be a verbatim substring of the returned narration.
  peakMoment: z.string().min(1),
})
export type StoryNaturalize = z.infer<typeof StoryNaturalizeSchema>

export interface StoryNaturalizerVars {
  language: string
  audienceDescriptor: string
  narration: string
  peakMoment: string
}

export function buildStoryNaturalizerPrompt(v: StoryNaturalizerVars): { system: string; userMessage: string } {
  const system = `You are a finishing editor with one skill: you hear the difference between a person talking and a machine imitating one. Read EVERY line aloud in the narrator's voice — literally hear it — and any line a real person wouldn't phrase that way gets re-said the way they would. Line by line, no skimming: the tells hide in lines that look fine on the page and only expose themselves out loud.

Language: ${v.language}${spokenRegisterBlock(v.language, v.audienceDescriptor)}

WHAT YOU REMOVE — the fingerprints:
- Constructed phrasing no one says out loud ("little did I know", a metronome of perfectly balanced clauses, the dramatic one-word sentence used as a formula).
- Uniform rhythm: sentences of near-identical length and skeleton marching in a row — rebuild one so the pattern breaks the way real speech does.
- Template shapes: three parallel items, mirrored pairs, a tidy moral or summary line where a person would just stop.
- Over-precision: wording too exact, too complete, too edited — real memory is a little rough at the edges.
- Bookish word choices in a spoken register: words nobody uses when actually telling the story to a friend (in Taglish, e.g. "Eksaktong tahimik" where a person says "Sobrang tahimik", or narrator-voice verbs where a plain one is what they'd say).
- LITERAL TRANSLATION + BROKEN LANGUAGE (top priority in Taglish/mixed-language scripts): any line that reads like an English sentence built word-for-word in Tagalog, or any garbled/grammatically-wrong phrase, gets re-said the way a real person would actually say it. ("Parang mali na hindi ko masabi kung anong totoo" → "Parang hindi ko na alam kung ano'ng totoo." A meaningless phrase like "bahay na ginagawa namin sa queue" → say plainly what was meant, or cut it.)

WHAT YOU NEVER TOUCH:
- The plot, the events, the structure, the order of beats, the emotional pacing, the point of view.
- Content: you may not add or remove story information — only re-hear a line the way a person would actually say it. RE-SAYING NEVER EXPANDS: a line comes back the same length or shorter, and the script's total length stays what it is; if your version is growing, you're writing, not finishing.
- The ONE content exception: broken language. If a phrase is garbled, meaningless, or grammatically wrong in the narration language (an actual defect, not a stylistic choice), fixing it to what the person clearly meant is finishing, not rewriting — do it.
- The spoken line-per-beat formatting.
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
