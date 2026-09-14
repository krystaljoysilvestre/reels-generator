// story-ending-critic.v1 — the LOCATE half of the bounded-edit pass (2026-08-06).
//
// The critic does exactly one thing: decide whether the ending lands, and if it doesn't, DELIMIT the
// region to replace as two integers. It never returns narration. That is the whole point — see
// packages/core/src/editing/bounded-edit.ts for the law this serves.
//
// The test is the DELETION TEST already shipped in story-critic.v2 (v2.19) and the finishing judge's
// `ending` axis, so the critic that locates a dead ending and the gate that rejects one are asking the
// same question. Genre-aware via WriterIdentity.closingCraft: a comedy button, a fairytale restoration
// and a lifestyle hand-off are different landings, and a critic blind to that over-fires.
//
// INDICES ARE 1-BASED here, matching the numbered list the model is shown. The caller converts to the
// primitive's 0-based indices — see the conversion in apps/worker/src/pipeline/steps/generate-story.ts.
import { z } from 'zod'
import type { SourcePolicy } from '../types/source-policy.js'
import { type StoryCreativeContext, STORY_CONTEXT_VERSION, renderStoryCreativeContext, renderStorySourceGuards } from './story-context.js'

// v1.1 — CALIBRATION (2026-08-06, probe-ending-repair control run). v1.0 fired on 2 of 4 hand-authored
// reference closes. The independent endings-audit judge graded all 4 as NOT weak (both disputed closes
// scored deletionLoss:'some'), so the critic — not the control set — was wrong. Two causes, both fixed
// below: (1) v1.0 had no middle band, so anything short of "essential" failed; (2) it inherited the
// absolute line "an aphorism is ALWAYS decoration", which the shipped judge states but demonstrably does
// not apply. v1.1 fails only the BOTTOM band, and makes the threshold deliberately asymmetric — on the
// fence means landed. That asymmetry is the same principle the whole pass runs on: repair is optional,
// an incorrect repair is expensive.
// v1.2 — same control run, second cause. v1.1 still fired on one exemplar, but its reasoning gave the
// defect away: it accepted the close's first sentence as "a real action beat that lands" and failed the
// close anyway because the SECOND sentence glossed it. That is grading the close's weakest part, not the
// close. The bottom band means the WHOLE close is decoration — a close containing a working beat has
// landed, and tightening a working close is not this pass's job (and could not be done by replacement
// anyway: trimming a trailing sentence is a delete, which the primitive deliberately does not offer).
// v1.3 — RECALL (2026-08-06, calibration harness over a 43-item labelled dev set). v1.2 scored recall
// 4/8 with 3 false fires, and EVERY miss was labelled `aphorism` by the critic itself: it identified the
// form and passed it anyway, using v1.2's "form is not the test" as a licence. The dev set shows the
// actual discriminator, and it is not form — it is whether the idea was already SAID:
//   · MISS  "Tinatrato mo ang sistema bilang sira — pero minsan, ikaw ang bug." — the story had already
//     stated the system was right and the narrator wrong. The close re-labels a stated idea.
//   · PASS  "Iba pala 'yung katahimikan kapag hindi ka na kailangan." — the story SHOWED the silence and
//     never named it. The close puts words to something the viewer felt but was never told.
// So v1.3 makes one mechanical demand: to fail a close, NAME the earlier sentence that already says it.
// That keeps the asymmetric threshold honest (no evidence ⇒ landed) while closing the aphorism loophole.
// v1.4 — DEFINITIONAL ALIGNMENT, not further tuning. The pre-registered metric counts an ending weak when
// `deletionLoss === 'nothing'` OR `terminalExposition === true`. v1.3 failed only the bottom band, so a
// close that glosses its own meaning WHILE adding a scrap of new information sat in a quadrant the critic
// could not reach by construction, however well it reasoned — one of its two remaining misses was exactly
// that. Terminal exposition now disqualifies on its own, keeping the named-earlier-sentence evidence bar
// so this widens what counts as a failure without lowering the standard of proof for one.
export const STORY_ENDING_CRITIC_V1_VERSION = `story-ending-critic.v1.5+${STORY_CONTEXT_VERSION}`

export const EndingCriticSchema = z.object({
  landed: z.boolean().describe('true if the ending earns its place; false if it is decoration'),
  sentenceStart: z.number().int().describe('1-based index of the first sentence to replace'),
  sentenceEnd: z.number().int().describe('1-based index of the last sentence to replace (inclusive)'),
  // Models return this as a string OR as an array of sentences — accept both and normalize at the call
  // site with `asModelText()`. NOT a zod .transform: llmCall's `z.ZodType<T>` requires input and output
  // to match, so a transform here widens T to `string | string[]` at every consumer instead of narrowing.
  closingLines: z
    .union([z.string(), z.array(z.string())])
    .describe('the sentences at those indices, quoted verbatim — the receipt for the indices'),
  problem: z.string().describe('one sentence naming what the close fails to do; empty if landed'),
  landingKind: z.enum(['object', 'place', 'action', 'image', 'question', 'aphorism', 'summary', 'other']),
})
export type EndingCriticVerdict = z.infer<typeof EndingCriticSchema>

export interface EndingCriticVars {
  creativeContext?: StoryCreativeContext | undefined
  sourcePolicy?: SourcePolicy | undefined
  genreCategory: string
  language: string
  /** WriterIdentity.closingCraft for this genre — how THIS genre is supposed to land. */
  closingCraft?: string | undefined
  /** The plan's hookPromise, when the story was planned — the check the close has to cash. */
  hookPromise?: string | undefined
  title: string
  /** The narration rendered as `1. …\n2. …` by splitNumberedSentences(). */
  numberedNarration: string
  sentenceCount: number
}

export function buildStoryEndingCriticPrompt(v: EndingCriticVars): { system: string; userMessage: string } {
  const craft = v.closingCraft
    ? `\n\nHOW THIS GENRE IS SUPPOSED TO LAND (${v.genreCategory}):\n${v.closingCraft}\nJudge against THIS, not against a general idea of a satisfying ending. A close that does this well LANDED, even if it is quiet, small, or plain.`
    : ''
  const promise = v.hookPromise
    ? `\n\nTHE PROMISE THE OPENING MADE: ${v.hookPromise}\nA close that never cashes this promise has not landed, however well written.`
    : ''

  const system = `${v.creativeContext ? `${renderStoryCreativeContext(v.creativeContext)}\n\n` : ''}${renderStorySourceGuards(v.sourcePolicy ?? v.creativeContext?.sourcePolicy)}\n\nYou judge ONE thing about a ${v.language} short-video narration: does it END, or does it just STOP?

You are not grading the story. You are not rewriting anything. You LOCATE.

THE DELETION TEST — interpret its result through the creator's form. An intentional refrain, a children's named takeaway or a useful recap can earn its place through its effect, without adding a new fact. Imagine deleting the closing lines. What does the viewer lose? Judge substance, NOT whether the lines feel conclusive. Grade the loss in three bands, and fail ONLY the bottom one:

- NOTHING (landed=false) — cutting the close loses no useful fact, image, consequence, idea OR intended effect. Its repetition or explanation contributes nothing to this form and weakens or needlessly delays the payoff. This is the only failing band.
- SOMETHING (landed=true) — the close adds a useful beat or effect: reflection, an action handed to the viewer, a genuine question, a purposeful refrain, recognition, reassurance or settling. It may be quiet, plain, abstract or deliberately repeated. It landed.
- ESSENTIAL (landed=true) — the close delivers the story's central promise, through consequence, an image, an answer or the effect this form needs.

REDUNDANT EXPOSITION IS A CANDIDATE FAILURE, NOT AN AUTOMATIC ONE. A close may repeat an idea or explain an image and still earn its place for this audience. Fail only when the proposed closing region adds no useful purpose in this form and its redundancy weakens the payoff. A new detail is not automatically useful, just as an old idea is not automatically useless.

THE TWO-PART TEST FOR REPETITION:
1. Find an earlier sentence that already delivers the same meaning, and quote it.
2. Explain what the closing repetition fails to contribute and how it weakens this story's intended ending. Check rhythm, recognition, reassurance, oral tradition, recap and the creator's explicit closing rules before deciding.
A duplicate without that second finding is not a failure. If the events only SHOWED the meaning and the close names it for the first time, assess that new reflection on its purpose; directness alone is not a defect.

Examples of the distinction:
- A redundant moral that restates the delivered idea and drains the final image can fail when removing it loses nothing useful.
- A children's named takeaway, a refrain returning at the close, or a recap that makes an explanation carryable can land even when the idea was already said.
- A new aphorism does not earn a pass just by being new; it must contribute to the intended experience.

JUDGE THE CLOSE AS A WHOLE. A weaker sentence inside a close that otherwise carries a useful beat or effect is not grounds to replace that working close. You locate a region with a concrete failure, not an opportunity to impose your preferred ending.

THE THRESHOLD IS DELIBERATELY ASYMMETRIC. A wrongly-flagged good ending can destroy a close that works. On a genuine fence, answer landed=true. For a repetition failure, the problem must quote the earlier sentence AND explain why this repetition adds no useful effect and weakens the payoff. If either finding is missing, leave the close intact.${craft}${promise}

THEN DELIMIT THE REGION TO REPLACE.
The narration is numbered 1..${v.sentenceCount}. Return the 1-BASED indices of the sentences a line editor should replace.
- Choose the SMALLEST region that contains the whole problem — normally the last 1 to 3 sentences.
- The region must be at the END of the narration. Never select from the opening or the middle.
- sentenceEnd is INCLUSIVE and is almost always ${v.sentenceCount}.
- Then quote those exact sentences verbatim in "closingLines". The indices are the instruction; the quote is the receipt that proves you delimited what you judged. If they disagree, the edit is abandoned — so make them agree.
- If landed=true, still fill the indices with the closing lines you judged, set problem to "".

landingKind = what the closing lines actually PLACE: object / place / action / image / question / aphorism / summary / other.

Judge what is on the page, not what was intended. Do not demand drama from a quiet genre, and do not pass an elegant sentence that says nothing new.`

  const userMessage = `TITLE: ${v.title}
GENRE: ${v.genreCategory}

NUMBERED NARRATION (${v.sentenceCount} sentences):
${v.numberedNarration}

Return JSON only:
{ "landed": false, "sentenceStart": 0, "sentenceEnd": 0, "closingLines": "", "problem": "", "landingKind": "summary" }`

  return { system, userMessage }
}
