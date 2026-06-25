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

// ── §2.3  Two-section crossfade (intro bed → climax bed at the twist) ─────────
// Two beds of the same sonic family crossfade around peakAnchorMs: the intro (restrained) fades OUT as
// the climax (intense) fades IN, completing by the peak so the climax bed carries the twist. Returned as
// a pair of FFmpeg volume expressions (eval=frame), mirroring buildGainExpr.

const CROSSFADE_SEC = 2.0

function withSilence(expr: string, silence?: GainEnvelopeParams['silenceDropMs']): string {
  if (!silence) return expr
  const s = silence.atMs / 1000
  const en = (silence.atMs + silence.durationMs) / 1000
  return `if(between(t,${s.toFixed(3)},${en.toFixed(3)}),0,${expr})`
}

export function buildTwoSectionGains(p: GainEnvelopeParams): { intro: string; climax: string } {
  const db = (x: number) => `pow(10,(${x.toFixed(3)})/20)`
  const fadeIn = 2.0
  const a = p.startAnchorMs / 1000
  const pk = p.peakAnchorMs / 1000
  // Crossfade window ends AT the peak so the climax bed is full when the twist lands.
  const cf = Math.max(a, pk - CROSSFADE_SEC)
  const denom = Math.max(0.001, pk - cf)

  // Intro: fade in to bed level, hold, then fade to silence across the crossfade; gone after the peak.
  const intro =
    `if(lt(t,${fadeIn}),(t/${fadeIn})*${db(p.bedDb)},` +
      `if(lt(t,${cf.toFixed(3)}),${db(p.bedDb)},` +
        `if(lt(t,${pk.toFixed(3)}),${db(p.bedDb)}*((${pk.toFixed(3)}-t)/${denom.toFixed(3)}),` +
          `0)))`

  // Climax: silent until the crossfade, rise to peak level across it, then hold the peak to the end.
  const climax =
    `if(lt(t,${cf.toFixed(3)}),0,` +
      `if(lt(t,${pk.toFixed(3)}),${db(p.peakDb)}*((t-${cf.toFixed(3)})/${denom.toFixed(3)}),` +
        `${db(p.peakDb)}))`

  return { intro: withSilence(intro, p.silenceDropMs), climax: withSilence(climax, p.silenceDropMs) }
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

   
  const fn = new Function('_if', `return ${body}`)
  return fn((_cond: boolean, a: number, b: number) => (_cond ? a : b)) as number
}
