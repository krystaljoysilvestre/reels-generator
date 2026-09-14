// story-ending-surgeon.v1 — the GENERATE half of the bounded-edit pass (2026-08-06).
//
// The surgeon is named for what it does: a constrained edit, not a rewrite. It receives an ASYMMETRIC
// context — an IMMUTABLE block it must not reproduce or alter, and a MUTABLE block it replaces — and it
// returns ONLY the replacement lines. It never sees a "return the full narration" instruction, because
// that instruction is the thing that has failed every previous attempt at revision here: the writer
// cannot take line-level notes, so asking for the whole artifact back produced a different story.
//
// The asymmetry is doing real work. A model handed one undifferentiated story and told "change only the
// end" treats the whole text as editable. A model handed two labelled blocks respects the boundary —
// and even when it doesn't, it cannot damage the prefix, because the prefix is never in its output.
import { z } from 'zod'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

// v1.1 — the informational/lifestyle register (2026-08-06, probe finding). v1.0 wrote a usable comedy
// button but could not close an explainer: its one informational attempt replaced a moral with a
// different moral ("Kasi minsan, ang sistema ay tama" → "Kung may gaps sa numbering — may rason 'yan"),
// and the independent judge still graded it terminal exposition. Both attempts share one shape — the
// narrator announcing a new habit or a new understanding — so v1.1 bans that shape by name and demands a
// concrete noun in the final line. Genre-neutral rules; the register still arrives via closingCraft.
// v1.2 — fixing a failure v1.1 CAUSED. "Hand it back where the viewer will next meet it" pushed the
// surgeon into second-person address ("Subukan mo…", "Nasa elevator ka rin minsan…") on stories narrated
// in interior first person. The verifier rejected all three — correctly, and that is the architecture
// working: a prompt regression was caught by software rather than shipping. v1.2 keeps the pin-it-to-a-
// thing intent and forbids the POV switch it was inducing.
export const STORY_ENDING_SURGEON_V1_VERSION = `story-ending-surgeon.v1.3+${STORY_CONTEXT_VERSION}`

export const EndingSurgeonSchema = z.object({
  // String or array of lines — normalized by `asModelText()` at the call site. See the note in
  // story-ending-critic.v1.ts on why this is not a zod .transform.
  closingLines: z
    .union([z.string(), z.array(z.string())])
    .describe('ONLY the replacement closing lines — never the whole narration'),
})
export type EndingSurgeonOutput = z.infer<typeof EndingSurgeonSchema>

export interface EndingSurgeonVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  genreCategory: string
  language: string
  audienceDescriptor: string
  /** Everything before the region: labelled unchangeable, present for continuity only. */
  immutablePrefix: string
  /** The current closing lines — the ONLY thing being replaced. */
  mutableClose: string
  /** The critic's one-sentence diagnosis: fix exactly this. */
  problem: string
  /** WriterIdentity.closingCraft — how THIS genre lands. */
  closingCraft?: string | undefined
  /** The plan's hookPromise: the check the close must cash. */
  hookPromise?: string | undefined
  /** The plan's viewerTransformation: where the viewer should arrive. */
  viewerTransformation?: { before: string; after: string } | undefined
  /** The peakMoment — untouchable, and usually the thing the close should pay off rather than repeat. */
  peakMoment?: string | undefined
}

export function buildStoryEndingSurgeonPrompt(v: EndingSurgeonVars): { system: string; userMessage: string } {
  const craft = v.closingCraft ? `\n\nHOW THIS GENRE LANDS (${v.genreCategory}):\n${v.closingCraft}` : ''
  const promise = v.hookPromise ? `\nTHE PROMISE THE OPENING MADE (cash it): ${v.hookPromise}` : ''
  const arrival = v.viewerTransformation
    ? `\nWHERE THE VIEWER STARTED: ${v.viewerTransformation.before}\nWHERE THE VIEWER SHOULD ARRIVE: ${v.viewerTransformation.after}`
    : ''
  const peak = v.peakMoment ? `\nTHE STORY'S PEAK (already happened — do not repeat or re-stage it): ${v.peakMoment}` : ''

  const system = `${v.creativeContext ? `${renderStoryCreativeContext(v.creativeContext)}\n\n` : ''}${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}\n\nYou are a line editor for ${v.language} short-video narration, working for ${v.audienceDescriptor}. Genre: ${v.genreCategory}.

You are replacing the CLOSING LINES of a story that is otherwise finished. The story does not stop — it has to LAND.

WHAT YOU RETURN: only the new closing lines. Never the whole narration, never the immutable text, never commentary. Fit the replaced region and the selected form's read-aloud rhythm; do not impose one beat per line.

WHAT THE OLD CLOSE GOT WRONG: ${v.problem}${craft}${promise}${arrival}${peak}

RULES — all of them are hard:
- ADD NO NEW EVENTS. No new scene, no time jump, no new thing happening. The story's events are finished; you are placing the last thing the viewer carries.
- ADD NO NEW PEOPLE, NAMES, OR PLACES. Every person, object, and place you mention must already exist in the immutable text above.
- FIX THE NAMED FAILURE IN THIS STORY'S OWN FORM. An image, action, question, reflection, explanation or earned direct takeaway may land it. Do not replace a functioning close merely to make it physical or more dramatic.
- ADD NO UNSUPPORTED CONCLUSION. Preserve the established meaning and facts. Avoid repeating a point the story has already delivered unless that repetition earns its purpose in the chosen form.
- A new image or habit is not required. Use the material already present to make the intended payoff clear; if the requested repair would need a new event or fact, keep the original close.
- DO NOT START ADDRESSING THE VIEWER. If the narration never says "ikaw"/"mo"/"you", your replacement must not either — no "subukan mo", no "nasa elevator ka rin minsan", no instruction aimed out of the frame. Switching to second person is a NARRATOR CHANGE, and it will be rejected. Stay inside the voice that has been speaking: the same "I" (or the same third person), noticing one last thing.
- KEEP THE VOICE EXACTLY: same language and code-switching, same tense, same person (if it is "I", stay "I"), same plainness. You are the same narrator, still speaking.
- CONTINUE from the immutable text — your first line must follow its last line naturally.
- MATCH THE LENGTH of what you are replacing, give or take a line. This is a close, not a new scene.

Write the ending this story earned.`

  const userMessage = `IMMUTABLE — the story so far. Do not reproduce it. Do not alter it. It is here so your ending fits it:
"""
${v.immutablePrefix}
"""

MUTABLE — replace THIS, and only this:
"""
${v.mutableClose}
"""

Return JSON only: { "closingLines": "your replacement lines" }`

  return { system, userMessage }
}
