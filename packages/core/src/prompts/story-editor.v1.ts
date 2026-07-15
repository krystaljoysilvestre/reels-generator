// story-editor.v1 — the PRODUCER. Improves the Writer's prose: cuts weak lines, strengthens what
// stays, makes sure every beat serves the story's goal. Improves, never scores; keeps the plot.
// Writing and editing are different cognitive tasks — professional prose goes through an editor.
//
// Contract: IN narration+peakMoment → OUT narration+peakMoment. Success = weak sentences removed
// and nothing else lost. Word-count bounds are enforced by the CALLER (out-of-bounds → the pass is
// discarded and the input text ships), so a runaway rewrite can never reach production.
// Versioned source code; craft + identities versions ride along.

import { z } from 'zod'
import { STORY_CRAFT_CORE, STORY_CRAFT_V1_VERSION, taglishRegisterBlock } from './story-craft.v1.js'
import { WRITER_IDENTITIES, renderIdentity, WRITER_IDENTITIES_V1_VERSION } from './writer-identities.v1.js'
import { asGenreModule, classifyGenre } from './scenes.v1.js'

export const STORY_EDITOR_V1_VERSION = `editor.v1.2+${STORY_CRAFT_V1_VERSION}+${WRITER_IDENTITIES_V1_VERSION}`

export const StoryEditSchema = z.object({
  narration: z.string().min(1),
  // The peak line after editing: keep the original line verbatim if untouched, or return the
  // edited version of that SAME line. Must be a verbatim substring of the returned narration.
  peakMoment: z.string().min(1),
})
export type StoryEdit = z.infer<typeof StoryEditSchema>

export interface StoryEditorVars {
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
  const identity = WRITER_IDENTITIES[asGenreModule(v.genreCategory ?? null) ?? classifyGenre(v.nicheDescription)]

  const system = `You are the producer/editor working with ${identity.label} on a narrated short-video script.
Niche: ${v.nicheDescription}

The writer you're editing for:
${renderIdentity(identity)}

The bar you edit against:
${STORY_CRAFT_CORE}

Language: ${v.language}${taglishRegisterBlock(v.language, v.audienceDescriptor)}

YOUR JOB — an actual editing pass, line by line:
- Interrogate EVERY line: would a person say this out loud? does it earn its place? is the feeling shown or merely reported? A first draft that survives an honest pass untouched is vanishingly rare — if you're returning the script unchanged, you almost certainly skimmed instead of edited.
- Cut weak, overthought, or forgettable lines; when a line exists only to connect two better ones, cut it and let them collide.
- Sharpen what stays. A vague beat becomes a specific one ("may kakaiba" becomes the actual detail); a told feeling ("kinabahan ako") becomes the moment that carries it — but only where the telling is genuinely weaker, never as a mechanical swap.
- The peak must be EARNED: whatever detonates at the climax should have been planted earlier as something the viewer heard but misread. If the draft's peak arrives unplanted, seed it — a small, innocent mention in an earlier beat (this is the one place you may add a line, and it must feel like it was always there).
- Check the shape: does every beat pull toward the ending's intended feeling ("${v.emotionalDestination}")? Trim what doesn't serve it.
- You improve. You do not score, rank, or comment.

HARD LIMITS — the writer's story is not yours to change:
- Same plot, same events, same point of view, same narrator.
- THE PAYOFF IS UNTOUCHABLE: the story's climactic reveal/peak moment must survive your pass — tighten its wording if it's flabby, but NEVER cut it, and never leave the script trailing off before it lands ("..." is not an ending). Cutting lines AFTER the peak is good editing; cutting the peak itself destroys the reel.
- Keep the spoken, line-per-beat formatting — this is read aloud.
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
