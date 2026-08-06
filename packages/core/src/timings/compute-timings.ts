// compute_timings — master-clock resolver (docs/08)
// PURE FUNCTION: no I/O, no network, no Date.now(). Same inputs → same outputs.
// Unit-test this harder than anything else in the codebase.

import type { AlignedChar } from '../types/timings.js'
import type { AudioScript } from '../types/audio-script.js'
import type { Timings, SubtitleChunk, SfxEvent, SceneTiming } from '../types/timings.js'

// ── Errors (fatal → fix queue, never publish) ─────────────────────────────────

export class AlignmentLengthError extends Error {
  constructor(narrationCps: number, alignmentLen: number) {
    super(
      `Alignment length mismatch: narration has ${narrationCps} code points, ` +
        `alignment has ${alignmentLen}. narration must be submitted verbatim, no pre-processing. [M10]`,
    )
    this.name = 'AlignmentLengthError'
  }
}

export class AnchorResolutionError extends Error {
  constructor(anchor: string, reason: 'not_found' | 'ambiguous', count?: number) {
    super(
      reason === 'not_found'
        ? `Anchor not found in narration: "${anchor}"`
        : `Anchor ambiguous (${count} matches): "${anchor}"`,
    )
    this.name = 'AnchorResolutionError'
  }
}

export class SceneCoverageError extends Error {
  constructor(message: string) {
    super(`Scene coverage error: ${message}`)
    this.name = 'SceneCoverageError'
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface TimingConfig {
  subtitle: {
    maxCharsPerChunk: number   // 84
    maxWordsPerChunk: number   // 7
    pauseBreakMs: number       // 350
    minDurationMs: number      // 700
    maxDurationMs: number      // 5000
  }
  clampSfx: boolean            // true
}

const DEFAULT_CONFIG: TimingConfig = {
  subtitle: {
    maxCharsPerChunk: 84,
    maxWordsPerChunk: 7,
    pauseBreakMs: 350,
    minDurationMs: 700,
    maxDurationMs: 5000,
  },
  clampSfx: true,
}

// Climax ring-out (§4.7). A hit at/above this level is treated as the climax (realism cues sit negative);
// it should have at least RING_OUT_MS of reel after it so its tail decays before the cut. Only an end-scare
// (less room than this) triggers a reel extension, and only by the shortfall.
const RING_OUT_HIT_THRESHOLD_DB = 3
const RING_OUT_MS = 7000

// ── Outro tail (§4.65) ────────────────────────────────────────────────────────
// The reel used to end on the last spoken character's timestamp — the voice stopped and the video was
// gone in the same frame, which reads as "it just stopped" rather than "it ended" (owner finding
// 2026-08-06). The tail is a BEAT, not padding: the closing image holds and keeps moving while the bed
// steps down and resolves (see buildGainExpr in packages/render/src/music/music-sync.ts). Captions are
// already finished by then — SubtitleOverlay renders nothing once the last chunk's endMs passes.
//
// Per-genre because how long an ending is allowed to breathe IS the genre (same reasoning as the
// GENRE_PAUSE_PROFILES above): comedy's button must cut fast or the laugh dies, while dread and wonder
// want to sit. Deterministic owner-set tuning, not a model decision. Unlisted genres take the default.
const OUTRO_TAIL_DEFAULT_MS = 2000
const OUTRO_TAIL_MAX_MS = 3000
const OUTRO_TAIL_MS: Record<string, number> = {
  comedy: 800,          // the tag lands and we're out — a held beat kills a punchline
  reddit_story: 1500,   // a real poster stops talking; no lingering
  commentary: 1500,     // the quotable line, then off
  informational: 1800,  // a beat to let the fact settle into the viewer's own world
  lifestyle: 2000,
  general: 2000,
  horror: 2200,         // hold the dread — the fear should outlast the picture
  drama: 2600,          // the small last gesture needs room
  fairytale: 2600,      // wonder resolves slowly
  childrens: 2600,      // a warm, safe landing before the lights go out
}

/** How long the closing image holds after the final spoken word, per genre. */
export function outroTailMs(genreCategory?: string): number {
  const raw = (genreCategory ? OUTRO_TAIL_MS[genreCategory] : undefined) ?? OUTRO_TAIL_DEFAULT_MS
  return Math.min(raw, OUTRO_TAIL_MAX_MS)
}

// ── Input ─────────────────────────────────────────────────────────────────────

export interface SceneSpan {
  idx: number
  narrationText: string   // full contiguous substring [M9]
  tier: 'still' | 'video'
}

export interface ComputeTimingsInput {
  narration: string
  alignment: AlignedChar[]     // length === Array.from(narration).length (§1 invariant)
  durationMs: number           // = last alignment endMs
  scenes: SceneSpan[]          // ordered, contiguous, tile the whole narration
  audioScript: AudioScript
  twistAnchor: string          // story.twist_anchor — music-peak fallback target
  genreCategory?: string       // channel genre — picks the outro tail length (§4.65)
  config?: Partial<TimingConfig>
}

// ── Anchor / substring matching (with a punctuation-tolerant fallback) ─────────
// The narration submitted to TTS is canonical; anchors and scene texts produced by the LLM must be
// EXACT substrings of it, because the alignment timestamps map 1:1 to the narration's code points.
// gpt-4o (unlike Claude) tends to silently "tidy" text when copying — swapping straight quotes for
// curly ones, hyphens for en/em dashes, or newlines for spaces — which broke the exact match and threw.
// So when the exact match fails we retry on a LENGTH-PRESERVING normalized view: each char is folded to
// a canonical equivalent (quotes→', dashes→-, any whitespace→space) WITHOUT changing the array length,
// so a normalized hit still maps back to the original code-point indices (and thus the right timestamps).

const SINGLE_QUOTES = new Set(["'", '‘', '’', '‚', '‛', '`', '´'])
const DOUBLE_QUOTES = new Set(['"', '“', '”', '„', '‟'])
const DASHES = new Set(['-', '‐', '‑', '‒', '–', '—', '―', '−'])

function normalizeChar(cp: string): string {
  if (SINGLE_QUOTES.has(cp)) return "'"
  if (DOUBLE_QUOTES.has(cp)) return '"'
  if (DASHES.has(cp)) return '-'
  if (/\s/.test(cp)) return ' '
  // Case-fold: the LLM routinely lowercases a sentence-initial anchor ("pag-angat" vs "Pag-angat"),
  // which silently dropped cues / degraded sustained spans. Exact pass runs first, so this only
  // rescues anchors that would otherwise fail entirely.
  return cp.toLowerCase()
}

// All start indices where `pat` occurs in `hay` (code-point arrays). Tries an exact pass first; if that
// finds nothing, retries comparing through normalizeChar (same indices — both arrays are equal length).
function findOccurrences(hay: string[], pat: string[]): number[] {
  const len = pat.length
  const exact: number[] = []
  for (let i = 0; i <= hay.length - len; i++) {
    let match = true
    for (let j = 0; j < len; j++) {
      if (hay[i + j] !== pat[j]) { match = false; break }
    }
    if (match) exact.push(i)
  }
  if (exact.length > 0) return exact

  const fuzzy: number[] = []
  for (let i = 0; i <= hay.length - len; i++) {
    let match = true
    for (let j = 0; j < len; j++) {
      if (normalizeChar(hay[i + j]!) !== normalizeChar(pat[j]!)) { match = false; break }
    }
    if (match) fuzzy.push(i)
  }
  return fuzzy
}

interface ResolvedAnchor {
  startMs: number
  endMs: number
}

function resolveAnchor(
  cps: string[],
  alignment: AlignedChar[],
  anchor: string,
  soft = false,
): ResolvedAnchor | null {
  if (!anchor) return null
  const anchorCps = Array.from(anchor)
  const occurrences = findOccurrences(cps, anchorCps)

  if (occurrences.length === 0) {
    if (soft) return null
    throw new AnchorResolutionError(anchor, 'not_found')
  }
  if (occurrences.length > 1) {
    if (soft) return null
    throw new AnchorResolutionError(anchor, 'ambiguous', occurrences.length)
  }

  const start = occurrences[0]!
  const end = start + anchorCps.length - 1
  return {
    startMs: alignment[start]!.startMs,
    endMs: alignment[end]!.endMs,
  }
}

// ── Main function ─────────────────────────────────────────────────────────────

export function computeTimings(input: ComputeTimingsInput): Timings {
  const cfg: TimingConfig = {
    subtitle: { ...DEFAULT_CONFIG.subtitle, ...input.config?.subtitle },
    clampSfx: input.config?.clampSfx ?? DEFAULT_CONFIG.clampSfx,
  }

  const warnings: string[] = []

  // §4.0 — Code-point arrays (guards the UTF-16 trap)
  const cps = Array.from(input.narration)
  if (cps.length !== input.alignment.length) {
    throw new AlignmentLengthError(cps.length, input.alignment.length)
  }

  // §4.2 — Scene cut points (gapless tiling)
  let cursor = 0
  const sceneTimings: SceneTiming[] = []

  for (let i = 0; i < input.scenes.length; i++) {
    const scene = input.scenes[i]!
    const sceneCps = Array.from(scene.narrationText)

    // Skip leading whitespace at cursor — spaces AND newlines/tabs; the narration has line breaks
    // between spoken beats, so scene boundaries land on '\n' as often as ' '.
    while (cursor < cps.length && /\s/.test(cps[cursor]!)) cursor++

    // Match scene text at cursor (exact, falling back to a punctuation-tolerant compare — gpt-4o may
    // swap quote/dash/whitespace variants when copying the span; the fallback preserves length/indices).
    let matched = true
    for (let j = 0; j < sceneCps.length; j++) {
      const a = cps[cursor + j]
      const b = sceneCps[j]!
      if (a !== b && (a === undefined || normalizeChar(a) !== normalizeChar(b))) { matched = false; break }
    }

    if (!matched) {
      throw new SceneCoverageError(
        `Scene ${i + 1} narrationText does not match narration at cursor ${cursor}. ` +
          `Expected: "${scene.narrationText.slice(0, 40)}…"`,
      )
    }

    const startMs = input.alignment[cursor]!.startMs
    cursor += sceneCps.length
    sceneTimings.push({ idx: scene.idx, startMs, endMs: 0, tier: scene.tier })
  }

  // Verify full coverage
  const remaining = cps.slice(cursor).join('').trim()
  if (remaining.length > 0) {
    throw new SceneCoverageError(`Narration not fully covered. Trailing text: "${remaining.slice(0, 60)}"`)
  }

  // Set endMs: each scene ends when the next begins; last ends at durationMs
  for (let i = 0; i < sceneTimings.length; i++) {
    sceneTimings[i]!.endMs = i + 1 < sceneTimings.length
      ? sceneTimings[i + 1]!.startMs
      : input.durationMs
  }

  // §4.3 — SFX placement
  const sfxEvents: SfxEvent[] = []
  for (const cue of input.audioScript.sfx) {
    // Soft: the annotator sometimes mis-quotes/paraphrases an anchor (casing, punctuation), so it isn't a
    // verbatim substring. A single missing SFX cue must NOT fail the whole render — drop it with a warning.
    const resolved = resolveAnchor(cps, input.alignment, cue.anchor, true)
    if (!resolved) { warnings.push(`SFX anchor unresolvable, cue dropped: "${cue.anchor}"`); continue }
    let atMs = resolved.startMs + cue.offsetMs
    if (atMs < 0 || atMs > input.durationMs) {
      if (cfg.clampSfx) {
        warnings.push(`SFX anchor "${cue.anchor}" clamped: atMs ${atMs} → clamped to [0, ${input.durationMs}]`)
        atMs = Math.max(0, Math.min(atMs, input.durationMs))
      }
    }
    // Sustained cue: resolve the end of the span (the END of the endAnchor phrase). Soft — an
    // unresolvable endAnchor degrades the cue to a point one-shot rather than dropping it.
    let endMs: number | undefined
    if (cue.endAnchor) {
      const resolvedEnd = resolveAnchor(cps, input.alignment, cue.endAnchor, true)
      if (resolvedEnd && resolvedEnd.endMs > atMs) {
        endMs = Math.min(resolvedEnd.endMs, input.durationMs)
      } else {
        warnings.push(`SFX endAnchor unresolvable or before start, cue degraded to one-shot: "${cue.endAnchor}"`)
      }
    }
    sfxEvents.push({ anchor: cue.anchor, prompt: cue.prompt, atMs, volumeDb: cue.volumeDb, ...(endMs != null ? { endMs } : {}) })
  }

  // §4.4 — Music anchors
  let musicTiming: Timings['music'] = null
  if (input.audioScript.music) {
    const m = input.audioScript.music

    // peak: peakAnchor → twistAnchor → 0.8 * duration (soft — never throw)
    let peakAnchorMs: number | undefined
    if (m.peakAnchor) {
      peakAnchorMs = resolveAnchor(cps, input.alignment, m.peakAnchor, true)?.startMs
    }
    if (peakAnchorMs === undefined && input.twistAnchor) {
      peakAnchorMs = resolveAnchor(cps, input.alignment, input.twistAnchor, true)?.startMs
    }
    if (peakAnchorMs === undefined) {
      peakAnchorMs = Math.round(0.8 * input.durationMs)
      warnings.push(`Music peak anchor unresolvable; using fallback 0.8 × duration = ${peakAnchorMs}ms`)
    }

    // Build start (startAnchorMs = where the rise to the peak begins). When the annotator gives no
    // startAnchor, DON'T build from t=0 — a whole-reel linear crawl reads as a static quiet bed with no
    // act structure. Default to a late build: the bed holds flat, then rises over the final stretch into
    // the peak (up to ~45s of build, never earlier than ~55% of the way there). Restraint early = the
    // build is FELT.
    const defaultBuildStartMs = Math.max(0, Math.max(Math.round(0.55 * peakAnchorMs), peakAnchorMs - 45_000))
    const startAnchorMs = m.startAnchor
      ? (resolveAnchor(cps, input.alignment, m.startAnchor, true)?.startMs ?? defaultBuildStartMs)
      : defaultBuildStartMs

    // Sanity clamp
    let safeStart = startAnchorMs
    let safePeak = peakAnchorMs
    if (!(0 <= safeStart && safeStart < safePeak && safePeak <= input.durationMs)) {
      safeStart = Math.max(0, Math.min(safeStart, input.durationMs - 1))
      safePeak = Math.max(safeStart + 1, Math.min(safePeak, input.durationMs))
      warnings.push(`Music anchors reordered/clamped to [${safeStart}, ${safePeak}]`)
    }

    musicTiming = { type: m.type, startAnchorMs: safeStart, peakAnchorMs: safePeak }
  }

  // §4.5 — Silence drop
  let silenceDrop: Timings['silenceDrop'] = null
  if (input.audioScript.silenceDrop) {
    const sd = input.audioScript.silenceDrop
    // Soft, same as SFX: a mis-quoted silence-drop anchor drops the effect with a warning, never fails render.
    const resolved = resolveAnchor(cps, input.alignment, sd.anchor, true)
    if (resolved) {
      const atMs = resolved.startMs
      const durationMs = Math.min(sd.durationMs, input.durationMs - atMs)
      silenceDrop = { atMs, durationMs }
    } else {
      warnings.push(`Silence-drop anchor unresolvable, effect dropped: "${sd.anchor}"`)
    }
  }

  // §4.6 — Subtitle chunking
  const subtitles = buildSubtitles(input.narration, input.alignment, cps, cfg)

  // §4.7 — Climax ring-out room. A loud climax HIT needs time for its tail to decay before the cut, or the
  // scare is chopped off. This is NOT a blanket outro: it only extends the reel when the hit lands near the
  // end with less than RING_OUT_MS after it (an end-scare), and only by the shortfall. A mid-story climax
  // already rings out over the following narration → no change. Genre-agnostic: gated purely on there being
  // a genuine loud hit (realism cues are negative dB), so a reflective non-scare ending is untouched. The
  // extra time is a held final frame (last scene extends) under the decaying tail.
  let durationMs = input.durationMs

  // §4.65 — Outro tail. Runs BEFORE the ring-out below so the tail is counted as room the hit already
  // has: a normal end-scare now needs no extension at all, and only a very late hit tops up the
  // shortfall. Held final frame + resolving bed; see outroTailMs for the per-genre reasoning.
  const tailMs = outroTailMs(input.genreCategory)
  let appliedTailMs = 0
  if (tailMs > 0 && sceneTimings.length > 0) {
    durationMs += tailMs
    appliedTailMs = tailMs
    const lastScene = sceneTimings[sceneTimings.length - 1]
    if (lastScene) lastScene.endMs = durationMs
  }

  if (sfxEvents.length > 0) {
    const loudest = sfxEvents.reduce((a, b) => (b.volumeDb > a.volumeDb ? b : a))
    if (loudest.volumeDb >= RING_OUT_HIT_THRESHOLD_DB) {
      const roomAfter = durationMs - loudest.atMs
      if (roomAfter < RING_OUT_MS) {
        const extendMs = RING_OUT_MS - roomAfter
        durationMs += extendMs
        const last = sceneTimings[sceneTimings.length - 1]
        if (last) last.endMs = durationMs
        warnings.push(`Climax ring-out: reel extended ${extendMs}ms so the hit tail decays before the cut`)
      }
    }
  }

  return {
    durationMs,
    scenes: sceneTimings,
    subtitles,
    sfxEvents,
    music: musicTiming,
    silenceDrop,
    outroTailMs: appliedTailMs,
    warnings,
  }
}

// ── Subtitle chunking (§4.6) ──────────────────────────────────────────────────

interface WordTiming {
  text: string
  startMs: number
  endMs: number
}

function buildSubtitles(
  narration: string,
  alignment: AlignedChar[],
  cps: string[],
  cfg: TimingConfig,
): SubtitleChunk[] {
  // Build word timings from alignment
  const words: WordTiming[] = []
  let wordStart: number | null = null
  let wordStartMs = 0
  let wordText = ''
  let i = 0

  for (const cp of cps) {
    if (cp !== ' ' && cp !== '\n') {
      if (wordStart === null) {
        wordStart = i
        wordStartMs = alignment[i]!.startMs
        wordText = ''
      }
      wordText += cp
    } else {
      if (wordStart !== null) {
        words.push({ text: wordText, startMs: wordStartMs, endMs: alignment[i - 1]!.endMs })
        wordStart = null
      }
    }
    i++
  }
  if (wordStart !== null && wordText) {
    words.push({ text: wordText, startMs: wordStartMs, endMs: alignment[cps.length - 1]!.endMs })
  }

  if (words.length === 0) return []

  // Greedy chunking
  const chunks: SubtitleChunk[] = []
  let chunkWords: WordTiming[] = []
  const SENTENCE_END = /[.?!…]$/

  for (let w = 0; w < words.length; w++) {
    const word = words[w]!
    const nextWord = words[w + 1]

    const projectedChars = chunkWords.reduce((s, x) => s + x.text.length + 1, 0) + word.text.length
    const projectedWordCount = chunkWords.length + 1

    chunkWords.push(word)

    const hardBreak =
      projectedChars > cfg.subtitle.maxCharsPerChunk ||
      projectedWordCount >= cfg.subtitle.maxWordsPerChunk ||
      SENTENCE_END.test(word.text)

    const pauseBreak =
      nextWord && nextWord.startMs - word.endMs >= cfg.subtitle.pauseBreakMs

    if (hardBreak || pauseBreak || !nextWord) {
      chunks.push(flushChunk(chunkWords))
      chunkWords = []
    }
  }
  if (chunkWords.length > 0) chunks.push(flushChunk(chunkWords))

  // Post-pass: min/max duration
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]!
    const next = chunks[c + 1]

    if (chunk.endMs - chunk.startMs < cfg.subtitle.minDurationMs) {
      const extended = chunk.startMs + cfg.subtitle.minDurationMs
      chunk.endMs = next ? Math.min(extended, next.startMs) : extended
    }

    if (chunk.endMs - chunk.startMs > cfg.subtitle.maxDurationMs) {
      // Split at largest internal pause — for simplicity keep first half at maxDuration
      chunk.endMs = chunk.startMs + cfg.subtitle.maxDurationMs
    }
  }

  return chunks
}

function flushChunk(words: WordTiming[]): SubtitleChunk {
  return {
    text: words.map((w) => w.text).join(' '),
    startMs: words[0]!.startMs,
    endMs: words[words.length - 1]!.endMs,
    words: words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })), // kept for word-highlight captions
  }
}
