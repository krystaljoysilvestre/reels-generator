// Deterministic chapter planning for long-form stories (see specs/long-form.md).
//
// One scene-breakdown LLM call is sound up to ~250s of narration (the 16-scene schema cap × the 16s
// per-shot guard). Past that, the breakdown runs once per CHAPTER. Chapters are cut here, in code,
// by OFFSET — never by an LLM — so they tile the narration byte-exactly and the M9/M10 invariants
// (scene texts tile the narration; alignment is 1:1 with the verbatim text) survive by construction.
//
// Cut-point preference: the END of a journey leg (the world-state ground truth from analyze_story —
// cutting where the narrator's place/company changes gives each chapter a coherent where/who), then a
// sentence boundary, then the nearest whitespace. A chapter never starts mid-word.

import type { JourneyLeg } from '../types/story-bible.js'
import { estimateNarrationSec } from './scene-qa.js'

// Stories at or under this estimated length take the single-call breakdown path (today's behavior,
// unchanged). Above it, the breakdown chapters. 180s sits safely inside the single-call comfort zone.
export const CHAPTER_THRESHOLD_SEC = 180

// Sizing: aim each chapter at ~150s (well inside one breakdown call), never smaller than ~60s (a
// sliver chapter wastes an LLM round and reads as a pacing hiccup).
const TARGET_CHAPTER_SEC = 150
const MIN_CHAPTER_SEC = 60

export interface StoryChapter {
  idx: number // 1-based, in narration order
  text: string // verbatim narration slice — chapters tile the narration exactly
  startOffset: number
  endOffset: number
  estSec: number
}

// Offsets (exclusive of 0 and len) where a journey leg's span ENDS, located cursor-forward the same
// way scene tiling is validated, so a repeated phrase can't match backwards.
function legEndOffsets(narration: string, journey: JourneyLeg[]): number[] {
  const ends: number[] = []
  let cursor = 0
  for (const leg of journey) {
    const span = leg.span?.trim()
    if (!span) continue
    const at = narration.indexOf(span, cursor)
    if (at === -1) continue
    cursor = at + span.length
    // Candidate cut sits past any whitespace after the span, so a chapter never opens on a space.
    let end = cursor
    while (end < narration.length && /\s/.test(narration[end]!)) end++
    if (end > 0 && end < narration.length) ends.push(end)
  }
  return ends
}

// Offsets where a sentence ends and the next begins (cut lands at the start of the next sentence).
function sentenceEndOffsets(narration: string): number[] {
  const ends: number[] = []
  const re = /[.!?…]+["»”')\]]*\s+/g
  for (let m = re.exec(narration); m; m = re.exec(narration)) {
    const end = m.index + m[0].length
    if (end > 0 && end < narration.length) ends.push(end)
  }
  return ends
}

// Nearest whitespace boundary to `ideal` inside (lo, hi) — the never-mid-word last resort.
function nearestWhitespace(narration: string, ideal: number, lo: number, hi: number): number | null {
  for (let d = 0; d < narration.length; d++) {
    for (const c of [ideal - d, ideal + d]) {
      if (c > lo && c < hi && /\s/.test(narration[c]!)) return c
    }
    if (ideal - d <= lo && ideal + d >= hi) break
  }
  return null
}

export function planChapters(narration: string, journey: JourneyLeg[] = []): StoryChapter[] {
  const totalSec = estimateNarrationSec(narration)
  const len = narration.length
  const count = Math.max(1, Math.ceil(totalSec / TARGET_CHAPTER_SEC))

  const toChapters = (cuts: number[]): StoryChapter[] => {
    const bounds = [0, ...cuts, len]
    const chapters: StoryChapter[] = []
    for (let i = 0; i < bounds.length - 1; i++) {
      const [a, b] = [bounds[i]!, bounds[i + 1]!]
      const text = narration.slice(a, b)
      if (!text.trim()) continue // a whitespace-only sliver folds away (can't happen with sane cuts)
      chapters.push({ idx: chapters.length + 1, text, startOffset: a, endOffset: b, estSec: estimateNarrationSec(text) })
    }
    return chapters
  }

  if (count === 1 || totalSec <= CHAPTER_THRESHOLD_SEC) return toChapters([])

  const charsPerSec = len / Math.max(1, totalSec)
  const minChars = Math.round(MIN_CHAPTER_SEC * charsPerSec)
  const chapterChars = len / count
  const window = Math.round(chapterChars * 0.35) // how far a cut may drift from its ideal position
  const legEnds = legEndOffsets(narration, journey)
  const sentenceEnds = sentenceEndOffsets(narration)

  const cuts: number[] = []
  let prev = 0
  for (let i = 1; i < count; i++) {
    const ideal = Math.round((i * len) / count)
    const lo = prev + minChars
    const hi = Math.min(len - minChars, ideal + window)
    if (lo >= hi) continue // no room (tail chapter would go under minimum) — merge into the previous
    const inRange = (c: number) => c > lo && c < hi
    // A leg end wins over a sentence end when it's within the window at all — chapter seams that
    // coincide with a place/company change are worth more than a few seconds of size symmetry.
    const cut =
      legEnds.filter(inRange).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0] ??
      sentenceEnds.filter(inRange).sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0] ??
      nearestWhitespace(narration, ideal, lo, hi)
    if (cut !== null) {
      cuts.push(cut)
      prev = cut
    }
  }

  return toChapters(cuts)
}

// The journey legs a chapter's scenes may live in — any leg whose span overlaps [start, end). Legs
// are passed WHOLE (never clipped): the QA locates them in the FULL narration, and a leg straddling
// a seam legitimately governs the scenes on both sides.
export function legsForChapter(
  narration: string,
  journey: JourneyLeg[],
  chapter: Pick<StoryChapter, 'startOffset' | 'endOffset'>,
): JourneyLeg[] {
  const out: JourneyLeg[] = []
  let cursor = 0
  for (const leg of journey) {
    const span = leg.span?.trim()
    if (!span) continue
    const at = narration.indexOf(span, cursor)
    if (at === -1) continue
    cursor = at + span.length
    if (at < chapter.endOffset && cursor > chapter.startOffset) out.push(leg)
  }
  return out
}
