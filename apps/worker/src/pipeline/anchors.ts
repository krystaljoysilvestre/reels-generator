import type { AlignedChar } from '@reels/core'

// Pure anchor-matching helpers shared by the audio-script and timing steps. An "anchor" is a verbatim
// substring of the narration that positions a sound/silence/operator cue on the master clock. Kept free
// of DB/provider imports so it's unit-testable in isolation.

// How many times `sub` occurs in `text` (overlapping matches counted — pos advances by 1). 0 for empty sub.
export function countOccurrences(text: string, sub: string): number {
  if (!sub) return 0
  let count = 0
  let pos = 0
  while ((pos = text.indexOf(sub, pos)) !== -1) {
    count++
    pos++
  }
  return count
}

interface AnchoredScript {
  sfx: Array<{ anchor: string }>
  silenceDrop?: { anchor: string } | null | undefined
}

// Validate that every SFX / silence anchor appears EXACTLY ONCE in the narration. compute_timings
// hard-resolves these, so a missing anchor can't place and an ambiguous one is unsafe. Returns a list of
// human-readable errors (empty = all valid) that drives the repair LLM call.
export function validateAnchorUniqueness(narration: string, audioScript: AnchoredScript): string[] {
  const errors: string[] = []

  const allAnchors: Array<{ anchor: string; field: string }> = [
    ...audioScript.sfx.map((s) => ({ anchor: s.anchor, field: 'sfx' })),
    ...(audioScript.silenceDrop ? [{ anchor: audioScript.silenceDrop.anchor, field: 'silenceDrop' }] : []),
  ]

  for (const { anchor, field } of allAnchors) {
    if (!anchor) continue
    const occurrences = countOccurrences(narration, anchor)
    if (occurrences === 0) errors.push(`${field} anchor not found in narration: "${anchor}"`)
    if (occurrences > 1) errors.push(`${field} anchor ambiguous (${occurrences} matches): "${anchor}"`)
  }

  return errors
}

// Resolve an anchor to its FIRST occurrence's timestamp (soft — returns null if absent). Operator/smart
// cues use this instead of compute_timings' strict unique-or-throw resolution, so an ambiguous anchor
// still places (at the first match) rather than vanishing or crashing the render. The returned time is the
// matched char's start + offset, clamped to [0, durationMs]. `cps` is Array.from(narration) (code points),
// aligned 1:1 with `alignment`.
export function resolveFirstMs(
  cps: string[],
  alignment: AlignedChar[],
  anchor: string,
  offsetMs: number,
  durationMs: number,
): number | null {
  const a = Array.from(anchor)
  if (a.length === 0 || a.length > cps.length) return null
  for (let i = 0; i <= cps.length - a.length; i++) {
    let match = true
    for (let j = 0; j < a.length; j++) {
      if (cps[i + j] !== a[j]) {
        match = false
        break
      }
    }
    if (match) {
      const start = alignment[i]?.startMs
      if (start == null) return null
      return Math.max(0, Math.min(start + offsetMs, durationMs))
    }
  }
  return null
}
