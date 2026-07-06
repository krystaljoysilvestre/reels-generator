// Narration pauses — dramatic beats added to a voiceover WITHOUT touching the narration text.
//
// The narration is submitted to TTS verbatim (the alignment maps 1:1 to its code points [M10]), and the
// story text can't be edited without re-rolling scene breakdown + images. So pauses are added in the TIME
// domain: silence is spliced into the voiceover audio while the alignment timestamps after each beat shift
// later by the same amount. Alignment LENGTH never changes (times move, not chars), so compute_timings /
// subtitles / the mixer pick the pauses up unchanged.
//
// TARGET-BASED, not additive. Every voice + story already has its own natural pauses (a TTS read can sit on
// 0.7–1.2s gaps at sentence ends on its own). Adding a flat N ms on top just blends in. So a beat declares
// the TOTAL silence it wants ("hold ~1.3s before the reveal"); at resolve time we measure the natural gap
// already there and top it up ONLY by the shortfall — so beats land at a consistent, deliberate length on
// any voice, and we never double-pause where the read already breathes.
//
// PURE: no I/O. Horror-tuned for now (a genre that lives on restraint + silence). Other genres get none.

import type { AlignedChar } from '../types/timings.js'

// A planned beat: where it goes + how much TOTAL silence it wants there. Known before synthesis.
export interface NarrationBeat {
  cpIndex: number    // the beat sits before this narration code-point index
  targetMs: number   // desired TOTAL silence before it (natural gap + any top-up)
  reason: string     // 'scene-boundary' | 'payoff-leadin' | 'payoff-sentence' | 'reveal'
}

// A resolved pause: the actual silence to splice in (target minus the natural gap already present).
export interface NarrationPause {
  cpIndex: number
  durationMs: number
  reason: string
}

// Target TOTAL silence per beat (ms). The voice's natural sentence pauses already reach ~1.2s, so the
// dread beats are set clearly ABOVE that — otherwise they blend into the normal pacing and read as nothing.
// The reveal is deliberately the single longest hold in the whole reel.
const SCENE_BOUNDARY_TARGET = 600   // a clean break between beats (tops up only if the read rushes it)
const PAYOFF_SENTENCE_TARGET = 900  // between sentences inside the final scene
const PAYOFF_LEADIN_TARGET = 1200   // entering the final (payoff) scene
const REVEAL_TARGET = 1800          // before the LAST sentence of the final scene (the reveal) — the big hang

const SENTENCE_END = /[.?!…]/
const isWs = (cp: string): boolean => /\s/.test(cp)

// Walk the narration the way compute_timings tiles it (skip whitespace, then each scene's text follows
// contiguously) to find the first spoken code-point index of every scene.
function sceneStartIndices(cps: string[], sceneTexts: string[]): number[] {
  const starts: number[] = []
  let cursor = 0
  for (const text of sceneTexts) {
    while (cursor < cps.length && isWs(cps[cursor]!)) cursor++
    starts.push(cursor)
    cursor += Array.from(text).length
  }
  return starts
}

// Start indices of each sentence AFTER the first, within [startCp, endCp): the first non-whitespace char
// that follows a sentence-ending punctuation mark.
function innerSentenceStarts(cps: string[], startCp: number, endCp: number): number[] {
  const starts: number[] = []
  let seenBoundary = false
  for (let i = startCp; i < endCp; i++) {
    const cp = cps[i]!
    if (SENTENCE_END.test(cp)) {
      seenBoundary = true
    } else if (seenBoundary && !isWs(cp)) {
      starts.push(i)
      seenBoundary = false
    }
  }
  return starts
}

// Plan dramatic beats for a reel's narration. `sceneTexts` are the scene narrationTexts in order (they
// tile the narration gaplessly). Returns beats sorted by cpIndex, de-duped (largest target wins on a tie).
export function planNarrationPauses(narration: string, sceneTexts: string[], genre?: string): NarrationBeat[] {
  if (genre !== 'horror' || sceneTexts.length === 0) return []

  const cps = Array.from(narration)
  const starts = sceneStartIndices(cps, sceneTexts)
  const lastIdx = sceneTexts.length - 1
  const raw: NarrationBeat[] = []

  // A clean break before each non-first scene; the final scene gets a longer payoff lead-in.
  for (let i = 1; i < starts.length; i++) {
    if (starts[i]! <= 0) continue
    raw.push({
      cpIndex: starts[i]!,
      targetMs: i === lastIdx ? PAYOFF_LEADIN_TARGET : SCENE_BOUNDARY_TARGET,
      reason: i === lastIdx ? 'payoff-leadin' : 'scene-boundary',
    })
  }

  // Inside the final scene: hold between sentences, longest before the last one (the reveal).
  const inner = innerSentenceStarts(cps, starts[lastIdx]!, cps.length)
  inner.forEach((cpIndex, k) => {
    const isReveal = k === inner.length - 1
    raw.push({
      cpIndex,
      targetMs: isReveal ? REVEAL_TARGET : PAYOFF_SENTENCE_TARGET,
      reason: isReveal ? 'reveal' : 'payoff-sentence',
    })
  })

  // De-dupe by cpIndex (a scene-boundary beat and a sentence break can collide) — keep the largest target.
  const byIndex = new Map<number, NarrationBeat>()
  for (const b of raw) {
    const ex = byIndex.get(b.cpIndex)
    if (!ex || b.targetMs > ex.targetMs) byIndex.set(b.cpIndex, b)
  }
  return [...byIndex.values()].sort((a, b) => a.cpIndex - b.cpIndex)
}

// Resolve planned beats against the actual alignment: for each beat, measure the natural silence already
// before it and add ONLY the shortfall to reach its target. Beats already at/over target add nothing and
// drop out. Returns the actual pauses to splice, sorted by cpIndex.
export function resolvePauses(beats: NarrationBeat[], alignment: AlignedChar[]): NarrationPause[] {
  const pauses: NarrationPause[] = []
  for (const b of beats) {
    if (b.cpIndex <= 0 || b.cpIndex >= alignment.length) continue
    const naturalGap = Math.max(0, alignment[b.cpIndex]!.startMs - alignment[b.cpIndex - 1]!.endMs)
    const add = Math.round(b.targetMs - naturalGap)
    if (add > 0) pauses.push({ cpIndex: b.cpIndex, durationMs: add, reason: b.reason })
  }
  return pauses.sort((a, b) => a.cpIndex - b.cpIndex)
}

export interface AppliedPauses {
  alignment: AlignedChar[]
  durationMs: number
  // Where to splice silence into the ORIGINAL (pre-shift) audio, so the mixer can add the actual gaps.
  insertions: { atMsOriginal: number; durationMs: number }[]
}

// Shift alignment timestamps to open a silent gap before each pause's code point, and return where the
// matching silence must be spliced into the original audio. Alignment length is preserved.
export function applyPausesToAlignment(
  alignment: AlignedChar[],
  durationMs: number,
  pauses: NarrationPause[],
): AppliedPauses {
  if (pauses.length === 0) return { alignment, durationMs, insertions: [] }
  const sorted = [...pauses].sort((a, b) => a.cpIndex - b.cpIndex)

  const insertions = sorted.map((p) => ({
    atMsOriginal: p.cpIndex < alignment.length ? alignment[p.cpIndex]!.startMs : durationMs,
    durationMs: p.durationMs,
  }))

  const shifted = alignment.map((c, i) => {
    let shift = 0
    for (const p of sorted) { if (p.cpIndex <= i) shift += p.durationMs }
    return { ...c, startMs: c.startMs + shift, endMs: c.endMs + shift }
  })

  const total = sorted.reduce((s, p) => s + p.durationMs, 0)
  return { alignment: shifted, durationMs: durationMs + total, insertions }
}
