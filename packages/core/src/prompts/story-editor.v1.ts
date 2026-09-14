// story-editor.v1 — the PRODUCER. Improves the Writer's prose: cuts weak lines, strengthens what
// stays, makes sure every beat serves the story's goal. Improves, never scores; keeps the plot.
// Writing and editing are different cognitive tasks — professional prose goes through an editor.
//
// Contract: IN narration+peakMoment → OUT narration+peakMoment. Success = weak sentences removed
// and nothing else lost. Word-count bounds are enforced by the CALLER (out-of-bounds → the pass is
// discarded and the input text ships), so a runaway rewrite can never reach production.
// Versioned source code; craft + identities versions ride along.

import { z } from 'zod'
import { STORY_CRAFT_CORE, STORY_CRAFT_V1_VERSION, spokenRegisterBlock } from './story-craft.v1.js'
import { WRITER_IDENTITIES, renderIdentity, WRITER_IDENTITIES_V1_VERSION } from './writer-identities.v1.js'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, resolveWritingGenre, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

export const STORY_EDITOR_V1_VERSION = `editor.v1.5+${STORY_CRAFT_V1_VERSION}+${WRITER_IDENTITIES_V1_VERSION}+${STORY_CONTEXT_VERSION}`

export const StoryEditSchema = z.object({
  narration: z.string().min(1),
  // The peak line after editing: keep the original line verbatim if untouched, or return the
  // edited version of that SAME line. Must be a verbatim substring of the returned narration.
  peakMoment: z.string().min(1),
})
export type StoryEdit = z.infer<typeof StoryEditSchema>

export interface StoryEditorVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  nicheDescription: string
  genreCategory?: string | undefined
  language: string
  audienceDescriptor: string
  narration: string
  peakMoment: string // '' when the writer produced none — then the editor also returns its best peak line
  emotionalDestination: string // from the plan — what the ending must leave the viewer feeling
  canonicalNames: string[] // world-bible names that must survive verbatim
  targetWords: number
}

export function buildStoryEditorPrompt(v: StoryEditorVars): { system: string; userMessage: string } {
  const identity = WRITER_IDENTITIES[resolveWritingGenre(v.creativeContext?.genre ?? v.genreCategory, v.nicheDescription)]
  // Genre-protected texture: craft that only LOOKS like a flaw to a general editing bar (a
  // confession's deliberate seams, a punchline's engineered word order). The general bar bends here.
  const protectedTexture = identity.editorProtects?.length
    ? `\nPROTECTED TEXTURE — in this genre, some craft only LOOKS like a flaw; your general bar bends to these:\n${identity.editorProtects.map((p) => `- ${p}`).join('\n')}\n`
    : ''

  const system = `You are the producer/editor working with ${identity.label} on a narrated short-video script.
Niche: ${v.nicheDescription}
Declared genre / form: ${v.creativeContext?.genre ?? v.genreCategory ?? '(derive from the channel intent)'}
${v.creativeContext ? `\n${renderStoryCreativeContext(v.creativeContext)}\n` : ''}
${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}

The writer you're editing for:
${renderIdentity(identity)}

The bar you edit against:
${STORY_CRAFT_CORE}

Language: ${v.language}${spokenRegisterBlock(v.language, v.audienceDescriptor)}

YOUR JOB — an actual editing pass, line by line:
- Read every line in the chosen voice and form: can this audience follow it, and does it earn its place? Preserve deliberate performance, precision, repetition and direct warmth. An unchanged script is valid when no edit improves it.
- Cut weak or redundant material while preserving the connective context a first-time listener needs. A bridge that clarifies who, where or why is doing story work.
- Sharpen what stays. A vague beat becomes a specific one ("may kakaiba" becomes the actual detail); a told feeling ("kinabahan ako") becomes the moment that carries it — but only where the telling is genuinely weaker, never as a mechanical swap.
- The pivotal moment must be earned in this form's own way. Clarify setup using information already established; do not manufacture a misdirection, clue, source fact or event to create a twist. A recognition, explanation or warm resolution can be the payoff.
- Check the emotional journey toward "${v.emotionalDestination}". Preserve contrast, release and reflection that help it land; do not make every beat carry the same feeling.
- You improve. You do not score, rank, or comment.
${protectedTexture}
HARD LIMITS — the writer's story is not yours to change:
- Same plot, same events, same point of view, same narrator — including the PERSON of the narrator: the words their life would reach for, the limits of what they knew at each point, the self-serving framing and its cracks, and the heat of their telling where the moment earns it. A "sharper" detail the narrator couldn't have known, a cleaned-up self-presentation, or a cooled-down line the teller meant hot, is a broken edit, not a better line.
- THE PAYOFF IS UNTOUCHABLE: the story's climactic reveal/peak moment must survive your pass — tighten its wording if it's flabby, but NEVER cut it, and never leave the script trailing off before it lands ("..." is not an ending). Later lines survive when they deliver the chosen form's consequence or settling; cutting the peak itself destroys the reel.
- Preserve the narration's purposeful paragraph/line formatting and read-aloud rhythm; do not impose one beat per line.
- Keep these canonical names exactly as written: ${v.canonicalNames.length ? v.canonicalNames.join(', ') : '(none)'}
- Stay within ~±15% of ${v.targetWords} words.
- Strong lines survive untouched — but restraint means protecting what works, never skipping the pass.`

  const userMessage = `Edit this script. Return the full edited narration.

PEAK LINE (the reel's climax — keep it verbatim, or return your edited version of that same line as "peakMoment"; it must appear verbatim in your narration): ${v.peakMoment || '(none marked — return the single strongest line as "peakMoment")'}

SCRIPT:
${v.narration}

OUTPUT (JSON only):
{
  "narration": "",
  "peakMoment": ""
}`

  return { system, userMessage }
}
