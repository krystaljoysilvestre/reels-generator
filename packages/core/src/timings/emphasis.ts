// Which word does a caption line land on?
//
// This module has its own entry in core's `exports` map ("./timings/emphasis") and imports no
// zod, because the Remotion browser bundle imports it as a VALUE — going through the `./timings`
// barrel would drag core's runtime into the render bundle (see packages/render/.../types.ts).
//
// The caption system gives every preset ONE accent — "the keyword breathes in a single
// accent", "the payoff word glows", "a highlighter swipe under the takeaway". Its third rule
// is explicit: *motion settles; one accent word moves.* The renderer used to accent whichever
// word was being spoken at that instant, so the accent travelled across the whole line and no
// preset ever had a single emphasis at all.
//
// WHY DELIVERY, AND NOT A LANGUAGE RULE OR A MODEL CALL.
// A stop-word list would encode one language's conventions as the default, which this repo
// rules out. A model pass would cost a call per reel and would be guessing at emphasis the
// narrator has already performed. The word a narrator HOLDS is the word they are leaning on,
// and marking it means the highlight agrees with what the viewer hears — which is the point of
// a caption. It is also free, works in any language, and needs no new pipeline stage.
//
// Measured against the real per-word timings of two finished reels, the held word is the
// payoff almost every line: "Not because people ⟦quit⟧", "Half the desks are ⟦empty⟧",
// "an artificial ⟦intelligence⟧ now", "Here's where it gets ⟦terrifying⟧".
//
// Phrase-final lengthening biases this toward the last word of a chunk. That is not a defect
// here: chunks break at sentence ends and pauses, so the last word usually IS the landing —
// and where it isn't, hold time still finds the content word ("⟦thousand⟧ miles per hour").

export interface EmphasisCandidate {
  text: string
  startMs: number
  endMs: number
  emphasis?: boolean | undefined
}

// Tokens with fewer than this many letters/digits — "a", "—", "I" — are never the landing.
const MIN_GRAPHEMES = 2

function graphemeCount(text: string): number {
  return [...text.replace(/[^\p{L}\p{N}]/gu, '')].length
}

/**
 * Index of the word a line lands on, or -1 if there isn't one.
 *
 * An explicit `emphasis` flag always wins. Otherwise the word held longest, with letter count
 * breaking ties — which also makes this correct for previews, where every word is given the
 * same synthetic duration and the longest word is the sensible stand-in.
 */
export function pickEmphasis(words: readonly EmphasisCandidate[]): number {
  const flagged = words.findIndex((w) => w.emphasis)
  if (flagged !== -1) return flagged
  // `false` is an explicit editorial decision too. Once a marking pass has touched a line, an all-false
  // line means "no accent"; falling back to delivery would silently undo the creator's choice.
  if (words.some((w) => w.emphasis === false)) return -1

  let best = -1
  let bestHeld = -1
  let bestLen = -1
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    const len = graphemeCount(w.text)
    if (len < MIN_GRAPHEMES) continue
    const held = Math.max(0, w.endMs - w.startMs)
    if (held > bestHeld || (held === bestHeld && len > bestLen)) {
      best = i
      bestHeld = held
      bestLen = len
    }
  }
  return best
}
