// story-edit-verifier.v1 — the REJECT-ONLY half of the bounded-edit pass (2026-08-06).
//
// This model GENERATES NOTHING. It is a semantic diff between the text that was removed and the text
// proposed in its place, and its only powers are "ok" and "reject". That constraint is deliberate: a
// verifier that could also improve the edit would be a second author, and we would be back to trusting
// a model to preserve what shouldn't change.
//
// Why it exists: a word-count guard cannot catch a fifteen-word close that quietly introduces "her
// brother", "the next morning", or "police later found" — new facts that contradict a story the viewer
// already watched, or that a later pipeline stage (scene breakdown, Story Bible continuity) will treat
// as canon. Length was never the risk; new information is.
//
// DELIBERATELY REGION-AGNOSTIC. Nothing here says "ending". When the same pass is pointed at the hook or
// the peak, this prompt is reused unchanged — see the ONE-PRIMITIVE-FOREVER note in
// packages/core/src/editing/bounded-edit.ts.
import { z } from 'zod'

export const STORY_EDIT_VERIFIER_V1_VERSION = 'story-edit-verifier.v1.0'

export const EditVerifierSchema = z.object({
  ok: z.boolean().describe('true only if the replacement introduces nothing new and preserves the voice'),
  violations: z
    .array(z.string())
    .describe('one short phrase per violation, quoting the offending words; empty when ok'),
})
export type EditVerifierVerdict = z.infer<typeof EditVerifierSchema>

export interface EditVerifierVars {
  language: string
  /** The unchanged part of the artifact — the authority on what already exists. */
  immutableContext: string
  /** The text being replaced. */
  removed: string
  /** The proposed replacement. */
  replacement: string
}

export function buildStoryEditVerifierPrompt(v: EditVerifierVars): { system: string; userMessage: string } {
  const system = `You verify a BOUNDED EDIT to a ${v.language} narration. You do not improve it, rewrite it, or suggest alternatives. You decide ONE thing: is this replacement safe?

You are given the UNCHANGED text (the authority on what already exists in this story), the REMOVED text, and the PROPOSED replacement.

REJECT (ok=false) if the replacement does ANY of these:
1. NEW NAMED ENTITY — a person, place, brand, or specific object that appears nowhere in the unchanged text or the removed text. A relationship word counts ("her brother", "my landlord") when that person was never established.
2. NEW TIMELINE MARKER — any new time movement: "the next day", "a year later", "that morning", "weeks after". The replacement may not move the story in time.
3. NEW EVENT OR CAUSALITY — something new happens, or something is now claimed to have caused something else. Placing an object that already exists is not a new event; someone DOING a new thing is.
4. TENSE SHIFT — the replacement narrates in a different tense than the surrounding text.
5. POV OR NARRATOR SHIFT — first person becomes third, or the voice becomes a different speaker (a narrator addressing the audience when the story was interior, or vice versa).
6. LANGUAGE SHIFT — a different language or a code-switching pattern the story was not already using.
7. CONTRADICTION — the replacement contradicts a fact stated in the unchanged text.

DO NOT reject for any of these — they are not your job:
- The replacement being better or worse, flatter or more beautiful, than what it replaced.
- A different image, object, or emotional note, as long as everything in it already exists.
- Being shorter or longer.
- Ending on a question, an object, or a plain statement.
- Re-mentioning something already established, even if the removed text did not mention it.

When in doubt about whether a detail is new, check the unchanged text. If it is there, it is not new. If you cannot find it, treat it as new and reject.

Quote the offending words in each violation so a human can check you.`

  const userMessage = `UNCHANGED TEXT (everything that already exists):
"""
${v.immutableContext}
"""

REMOVED:
"""
${v.removed}
"""

PROPOSED REPLACEMENT:
"""
${v.replacement}
"""

Return JSON only: { "ok": true, "violations": [] }`

  return { system, userMessage }
}
