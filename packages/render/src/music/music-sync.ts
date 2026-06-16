// Music sync helpers — docs/07-music-sync-spec.md §2
// Pure functions. No I/O. Unit-test hard.

// ── §2.1  Tempo factor (time-stretch so the track's natural peak lands at peakAnchorMs) ──

/**
 * Returns the atempo factor to feed FFmpeg so the track's natural build peak
 * aligns with peakAnchorMs in the reel timeline.
 *
 * factor > 1 = speed up (compress time); factor < 1 = slow down.
 * FFmpeg atempo accepts [0.5, 2.0] per stage — callers must chain stages if |factor| is outside that range.
 * For flat drones (peakFrac === 0) returns 1.0 (no stretch; gain envelope handles dynamics).
 */
export function tempoFactor(
  trackDurMs: number,
  trackPeakFrac: number,
  peakAnchorMs: number,
): number {
  if (trackPeakFrac === 0) return 1.0 // flat drone — no inherent build to align
  if (peakAnchorMs <= 0) return 1.0
  const naturalPeakMs = trackDurMs * trackPeakFrac
  return naturalPeakMs / peakAnchorMs
}

/**
 * Decompose a tempo factor into FFmpeg atempo filter stages (each clamped to [0.5, 2.0]).
 * e.g. factor=0.25 → ['atempo=0.5', 'atempo=0.5']
 */
export function atempoChain(factor: number): string[] {
  if (factor <= 0) throw new RangeError(`tempo factor must be > 0, got ${factor}`)
  const stages: string[] = []
  let remaining = factor
  while (remaining > 2.0) {
    stages.push('atempo=2.0')
    remaining /= 2.0
  }
  while (remaining < 0.5) {
    stages.push('atempo=0.5')
    remaining /= 0.5
  }
  stages.push(`atempo=${remaining.toFixed(6)}`)
  return stages
}

// ── §2.2  Volume envelope (keyed to timestamps, output as FFmpeg volume expression) ──

export interface GainEnvelopeParams {
  startAnchorMs: number
  peakAnchorMs: number
  bedDb: number       // resting level, e.g. -22
  peakDb: number      // at twist peak, e.g. -12
  durationMs: number
  silenceDropMs?: { atMs: number; durationMs: number }
}

/**
 * Returns an FFmpeg `volume` filter expression (dB→linear) that:
 *  - fades in from 0 to bedDb over 0..startAnchorMs+2s
 *  - holds bedDb from startAnchorMs to build-start
 *  - rises linearly bedDb→peakDb over startAnchorMs..peakAnchorMs
 *  - hard-zeros during the silence drop window (highest priority)
 *
 * The expression is used with `eval=frame` so it updates per-sample.
 */
export function buildGainExpr(p: GainEnvelopeParams): string {
  const db = (x: number) => `pow(10,(${x.toFixed(3)})/20)`
  const a = p.startAnchorMs / 1000
  const pk = p.peakAnchorMs / 1000
  const fadeIn = 2.0 // seconds

  // piecewise gain: fade-in → bed → linear rise → hold peak
  const piecewise =
    `if(lt(t,${fadeIn}),` +
      `(t/${fadeIn})*${db(p.bedDb)},` +
      `if(lt(t,${a.toFixed(3)}),` +
        `${db(p.bedDb)},` +
        `if(lt(t,${pk.toFixed(3)}),` +
          `${db(p.bedDb)}+(${db(p.peakDb)}-${db(p.bedDb)})*((t-${a.toFixed(3)})/(${pk.toFixed(3)}-${a.toFixed(3)})),` +
          `${db(p.peakDb)}` +
        `)` +
      `)` +
    `)`

  if (!p.silenceDropMs) return piecewise

  const s = p.silenceDropMs.atMs / 1000
  const en = (p.silenceDropMs.atMs + p.silenceDropMs.durationMs) / 1000

  // silence_drop overrides everything — hard zero in that window
  return `if(between(t,${s.toFixed(3)},${en.toFixed(3)}),0,${piecewise})`
}

// ── Convenience: validate gain at a point (used in unit tests) ────────────────

/** Evaluate the linear gain at a given time by running the expression as a tiny numeric parser. */
export function evalGainAt(expr: string, tSec: number): number {
  // Safe eval: replace t with the value and compute with Function
  // Only used in tests — not shipped to production.
  const body = expr
    .replace(/\blt\(([^,]+),([^)]+)\)/g, '($1 < $2)')
    .replace(/\bbetween\(([^,]+),([^,]+),([^)]+)\)/g, '($1 >= $2 && $1 <= $3)')
    .replace(/\bpow\(/g, 'Math.pow(')
    .replace(/\bif\(/g, '_if(')
    .replace(/\bt\b/g, String(tSec))

  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const fn = new Function('_if', `return ${body}`)
  return fn((_cond: boolean, a: number, b: number) => (_cond ? a : b)) as number
}
