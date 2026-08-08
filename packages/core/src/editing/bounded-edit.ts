// The bounded-edit primitive (2026-08-06).
//
// THE LAW this file exists to enforce: generation creates artifacts; editing operates only on an
// explicitly bounded region; SOFTWARE — not prompts — guarantees everything else is unchanged.
//
// Every prior attempt at revision in this pipeline asked a model to "rewrite only X, keep the rest"
// and trusted it. That failed every time (see decision-log 2026-08-06-002): the writer cannot take
// line-level notes, so a note produced a different story instead of a revised one. So here no model
// ever returns the artifact. A model names a region (two integers) or emits a replacement for that
// region; this module performs the edit, and the prefix cannot change because nothing was ever given
// the chance to change it.
//
// THIS FILE STAYS BORINGLY GENERIC — FOREVER. It knows about sentences, indices, and identity
// guarantees. It knows NOTHING about endings, hooks, or peaks. There must never be an
// `ending-edit.ts` / `hook-edit.ts` / `peak-edit.ts`: all region-specific behaviour belongs in the
// critic / surgeon / verifier PROMPTS, which are cheap to add. Forking the primitive is how a system
// ends up with five subtly different editing engines and no guarantees at all. When someone needs
// "just a small variant" of spliceSentences, the answer is a parameter or a new prompt, not a new file.
//
// THE ARTIFACT CHANGES EXACTLY ONCE, AT reindex() — NOT AT spliceSentences(). Until normalization
// finishes, spliced text is an intermediate, not a version: its sentence indices no longer describe
// it. Callers hand downstream stages `reindex(spliced).narration` — never the splice output directly.

/**
 * Coerce a model's text field that may arrive as a string or as an array of lines. Every bounded-edit
 * caller needs this, and it belongs here rather than in a zod `.transform` because llmCall's
 * `z.ZodType<T>` requires the schema's input and output types to match — a transform widens `T` to
 * `string | string[]` at every downstream consumer instead of narrowing it at the boundary.
 */
export function asModelText(value: string | string[]): string {
  return Array.isArray(value) ? value.join('\n') : value
}

export class BoundedEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoundedEditError'
  }
}

/** A region of the artifact, as INCLUSIVE indices into `SentenceSplit.raw`. */
export interface SentenceRegion {
  start: number
  end: number
}

export interface SentenceSplit {
  /** Segments including their punctuation AND trailing whitespace: `raw.join('')` === the input, exactly. */
  raw: string[]
  /** The same segments trimmed — for prompting and logging, never for splicing. */
  display: string[]
  /** `1. …\n2. …` — the numbered list a critic reads so it can answer with two integers. */
  numbered: string
}

const TERMINALS = new Set(['.', '?', '!', '…'])
// A terminal followed by one of these still ends the sentence: `kaya."` must keep its closing quote.
const CLOSERS = new Set(['"', "'", '”', '’', '»', ')', ']'])

const SINGLE_QUOTES = new Set(["'", '’', '‘', '‚', '‛', '′'])
const DOUBLE_QUOTES = new Set(['"', '“', '”', '„', '‟', '″', '«', '»'])
const DASHES = new Set(['-', '–', '—', '―', '‑', '‒'])

// Same folding idea as compute-timings' `normalizeChar` (quotes/dashes/whitespace/case), kept local so
// the primitive stays dependency-free. Used ONLY for cross-checks and containment tests — never to
// build the artifact, which is always assembled from verbatim segments.
function fold(s: string): string {
  return Array.from(s)
    .map((cp) => {
      if (SINGLE_QUOTES.has(cp)) return "'"
      if (DOUBLE_QUOTES.has(cp)) return '"'
      if (DASHES.has(cp)) return '-'
      if (/\s/.test(cp)) return ' '
      return cp.toLowerCase()
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Split an artifact into numbered sentence segments. A segment ends at a run of terminal punctuation
 * (plus any closing quote/bracket) followed by whitespace or end-of-text, OR at a newline — the
 * narration is written one beat per line, so a line break is a real boundary even without punctuation.
 *
 * `raw.join('')` reconstructs the input byte for byte. That property is what makes splicing exact.
 */
export function splitNumberedSentences(narration: string): SentenceSplit {
  const cps = Array.from(narration)
  const segments: string[] = []
  let buf = ''
  let i = 0

  while (i < cps.length) {
    const cp = cps[i]!
    buf += cp
    i++
    if (cp === '\n') {
      segments.push(buf)
      buf = ''
      continue
    }
    if (!TERMINALS.has(cp)) continue

    while (i < cps.length && TERMINALS.has(cps[i]!)) buf += cps[i++]!
    while (i < cps.length && CLOSERS.has(cps[i]!)) buf += cps[i++]!
    const next = cps[i]
    if (next !== undefined && !/\s/.test(next)) continue // mid-sentence "." (abbreviation, decimal)

    // Absorb the trailing whitespace run so the suffix keeps its formatting when a region is replaced.
    while (i < cps.length && /\s/.test(cps[i]!) && cps[i] !== '\n') buf += cps[i++]!
    if (cps[i] === '\n') buf += cps[i++]!
    segments.push(buf)
    buf = ''
  }
  if (buf) segments.push(buf)

  // A whitespace-only segment (blank line between beats) is not a sentence — fold it into its
  // neighbour so every index in the numbered list points at real text.
  const raw: string[] = []
  for (const seg of segments) {
    if (seg.trim() === '' && raw.length > 0) raw[raw.length - 1] += seg
    else if (seg.trim() === '' && segments.length > 1) continue
    else raw.push(seg)
  }
  if (raw.length === 0 && narration.length > 0) raw.push(narration)

  const display = raw.map((s) => s.trim())
  return {
    raw,
    display,
    numbered: display.map((d, idx) => `${idx + 1}. ${d}`).join('\n'),
  }
}

export interface SpliceResult {
  /** The spliced INTERMEDIATE — pass through `reindex()` before anything downstream sees it. */
  narration: string
  /** Everything before the region. Byte-identical to the input's prefix, asserted below. */
  prefix: string
  /** The verbatim text that was replaced (for the audit trail). */
  removed: string
  /** The replacement as actually inserted (trimmed). */
  replacement: string
}

/**
 * Replace `region` (inclusive sentence indices) with `replacement`. Everything outside the region is
 * carried over verbatim, and the prefix identity is ASSERTED rather than assumed — including that the
 * replacement did not merge into the previous sentence and shift the segmentation underneath it.
 *
 * Throws BoundedEditError on anything unexpected. Callers fail closed: keep the original artifact.
 */
export function spliceSentences(narration: string, region: SentenceRegion, replacement: string): SpliceResult {
  const { raw } = splitNumberedSentences(narration)
  const { start, end } = region
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    throw new BoundedEditError(`region indices must be integers, got [${start},${end}]`)
  }
  if (start < 0 || end >= raw.length || start > end) {
    throw new BoundedEditError(`region [${start},${end}] out of range for ${raw.length} sentence(s)`)
  }
  const body = replacement.trim()
  if (!body) throw new BoundedEditError('replacement is empty')

  const prefix = raw.slice(0, start).join('')
  const removed = raw.slice(start, end + 1).join('')
  const suffix = raw.slice(end + 1).join('')
  const tail = /\s*$/.exec(removed)?.[0] ?? '' // keep the removed span's trailing whitespace/newline

  const next = prefix + body + tail + suffix

  // The design guarantee, made a runtime one.
  if (!next.startsWith(prefix)) {
    throw new BoundedEditError('prefix identity violated: spliced text does not begin with the original prefix')
  }
  if (suffix && !next.endsWith(suffix)) {
    throw new BoundedEditError('suffix identity violated: spliced text does not end with the original suffix')
  }
  // The subtler failure: a replacement that lacks terminal punctuation can merge with the sentence
  // before it, so the prefix survives as CHARACTERS while the boundaries move underneath it.
  const resplit = splitNumberedSentences(next)
  if (resplit.raw.slice(0, start).join('') !== prefix) {
    throw new BoundedEditError('prefix identity violated: the replacement changed sentence boundaries in the prefix')
  }

  return { narration: next, prefix, removed, replacement: body }
}

export interface NormalizedArtifact {
  narration: string
  split: SentenceSplit
}

/**
 * Close an edit: normalize the spliced intermediate and re-derive its indices. THE OUTPUT OF THIS
 * FUNCTION — not the splice's — is the next version of the artifact. Normalization is deliberately
 * conservative (whitespace only), because narration text is load-bearing downstream: `compute_timings`
 * tiles scenes by requiring each scene's `narrationText` to be a verbatim contiguous substring of the
 * body, and anything cleverer here would surface as a SceneCoverageError much later.
 */
export function reindex(narration: string): NormalizedArtifact {
  const clean = narration
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+$/gm, '') // trailing spaces/tabs per line
    .replace(/[^\S\n]{2,}/g, ' ') // runs of spaces inside a line
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { narration: clean, split: splitNumberedSentences(clean) }
}

export interface RegionGuards {
  /**
   * The region must lie within the final fraction of the artifact (default 0.35). This is what stops
   * a "fix the ending" edit from rewriting the middle of the story.
   */
  lastFraction?: number
  /** Replacement length ceiling, as a multiple of the removed span (default 2.5). */
  maxGrowthRatio?: number
  /**
   * Text that must NOT fall inside the region — e.g. the peakMoment, which drives music timing and
   * earns its own scene. If the peak lives in the closing lines then the payoff IS the ending, and a
   * dead close is not the diagnosis: skip the edit instead of performing it.
   */
  protect?: Array<string | undefined | null>
}

export type RegionCheck = { ok: true } | { ok: false; reason: string }

/**
 * Validate a proposed edit BEFORE calling a surgeon or splicing. Returns a reason rather than
 * throwing, because every caller does the same thing with a failure: log it and keep the original.
 */
export function validateRegion(
  narration: string,
  region: SentenceRegion,
  replacement: string | null,
  guards: RegionGuards = {},
): RegionCheck {
  const { raw } = splitNumberedSentences(narration)
  const { start, end } = region
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { ok: false, reason: `region indices are not integers: [${start},${end}]` }
  }
  if (start < 0 || end >= raw.length) {
    return { ok: false, reason: `region [${start},${end}] out of range for ${raw.length} sentence(s)` }
  }
  if (start > end) return { ok: false, reason: `inverted region [${start},${end}]` }

  const lastFraction = guards.lastFraction ?? 0.35
  const total = narration.length
  const startOffset = raw.slice(0, start).join('').length
  if (total > 0 && startOffset / total < 1 - lastFraction) {
    const pct = Math.round((startOffset / total) * 100)
    return {
      ok: false,
      reason: `region starts at ${pct}% of the artifact, outside the final ${Math.round(lastFraction * 100)}%`,
    }
  }

  const removed = raw.slice(start, end + 1).join('')
  for (const p of guards.protect ?? []) {
    const needle = p?.trim()
    if (!needle) continue
    if (fold(removed).includes(fold(needle))) {
      return { ok: false, reason: `region contains protected text: "${needle.slice(0, 60)}"` }
    }
  }

  if (replacement !== null) {
    const body = replacement.trim()
    if (!body) return { ok: false, reason: 'replacement is empty' }
    const ratio = removed.trim().length > 0 ? body.length / removed.trim().length : Infinity
    const maxGrowth = guards.maxGrowthRatio ?? 2.5
    if (ratio > maxGrowth) {
      return { ok: false, reason: `replacement is ${ratio.toFixed(1)}× the removed span (max ${maxGrowth}×)` }
    }
  }

  return { ok: true }
}

/**
 * Cross-check a critic's verbatim quote against the region its indices actually select. The indices
 * are the mechanism; the quote is the receipt. A mismatch means the critic judged one span and
 * delimited another — fail closed, because a guessed span is exactly what this design exists to avoid.
 *
 * Tolerant in one direction only: the quote may be a subset of the region or vice versa (a critic that
 * quotes 2 of 3 sentences, or drops a trailing ellipsis, is still pointing at the same place).
 */
export function quoteMatchesRegion(narration: string, region: SentenceRegion, quote: string): boolean {
  const { raw } = splitNumberedSentences(narration)
  if (region.start < 0 || region.end >= raw.length || region.start > region.end) return false
  const a = fold(raw.slice(region.start, region.end + 1).join(''))
  const b = fold(quote)
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}
