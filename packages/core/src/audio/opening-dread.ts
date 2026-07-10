import type { SfxCue } from '../types/audio-script.js'

// Guaranteed opening dread bed (owner-set default for HORROR, 2026-07-10: "continuous scary feeling from
// the start... intense right from the start, not building up"). The LLM sound designer would not reliably
// place a tension texture on the very first line, so the pipeline injects one: a low, continuous dread
// texture that runs as a SUSTAINED loop from the narration's first words until the climax, so dread is
// present and felt from second one and deepens into the payoff. This is deliberate per-genre tuning (the
// legitimate exception in the unbiased-design skill), not a creative choice left to the model.
//
// Pure + testable. Returns null when it can't form a valid, resolvable cue (no climax anchor, too-short
// narration, or the opening/end anchors would coincide) — the caller then simply omits it (fail-safe).

const OPENING_ANCHOR_WORDS = 5 // first N narration words = a start-of-reel anchor (position 0, ~unique)

export function buildOpeningDreadCue(params: {
  narration: string
  endAnchor: string          // a later verbatim narration substring — usually the climax/reveal line
  prompt?: string
  volumeDb?: number
  targetDurationSec?: number
}): SfxCue | null {
  const words = params.narration.trim().split(/\s+/).filter(Boolean)
  const endAnchor = params.endAnchor.trim()
  if (words.length < OPENING_ANCHOR_WORDS + 2 || !endAnchor) return null

  const anchor = words.slice(0, OPENING_ANCHOR_WORDS).join(' ')
  // Must be a real substring, and must not coincide with (or contain) the end — else the span is empty.
  if (!params.narration.includes(anchor)) return null
  if (endAnchor === anchor || endAnchor.startsWith(anchor) || anchor.startsWith(endAnchor)) return null

  return {
    anchor,
    endAnchor,
    offsetMs: 0,
    prompt: params.prompt ?? 'low pulsing dread drone, continuous and unsettling, seamless loop',
    volumeDb: params.volumeDb ?? -14, // present-but-under: a continuous unease, not a dominating layer
    targetDurationSec: params.targetDurationSec ?? 10,
    impactAtEnd: false,
  }
}

// Pick the best end point for the dread span from a design: the climax hit's anchor, else the music's
// peak/twist line, else null. (The dread runs from the open until here, then the payoff takes over.)
export function pickDreadEndAnchor(design: {
  sfx: Array<{ anchor: string; impactAtEnd: boolean }>
  music?: { peakAnchor?: string } | null
}): string | null {
  const climax = design.sfx.find((c) => c.impactAtEnd)?.anchor
  if (climax) return climax
  const peak = design.music?.peakAnchor?.trim()
  return peak ? peak : null
}
