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
  // Outro tail (compute-timings §4.65): the closing image holds this long after the last spoken word.
  // The bed RESOLVES across it instead of being hard-cut at full level by ffmpeg's `-t`. Omit/0 → the
  // legacy hold-peak-to-the-last-sample behaviour.
  outroTailMs?: number
  ending?: {
    startMs: number
    voiceEndMs: number
    endMs: number
    focus: 'music' | 'ambience' | 'silence'
    shape: 'button' | 'resolve' | 'ring_out'
  }
  silenceDropMs?: { atMs: number; durationMs: number }
}

/** Fade window at the terminal edge. A ring-out decays across its whole three-second tail; a resolve or
 * button carries first, then uses a shorter final release. The story-level shape remains Direction. */
export function endingTerminalFadeMs(shape: 'button' | 'resolve' | 'ring_out'): number {
  if (shape === 'button') return 150
  if (shape === 'ring_out') return 3000
  return 700
}

function smoothLerpExpr(from: number, to: number, startSec: number, durationSec: number): string {
  const d = Math.max(0.001, durationSec)
  const x = `((t-${startSec.toFixed(3)})/${d.toFixed(3)})`
  const smooth = `((${x})*(${x})*(3-2*(${x})))`
  return `(${from.toFixed(8)}+(${to.toFixed(8)}-${from.toFixed(8)})*${smooth})`
}

/**
 * Returns an FFmpeg `volume` filter expression (dB→linear) that:
 *  - fades in from 0 to bedDb over 0..startAnchorMs+2s
 *  - holds bedDb from startAnchorMs to build-start
 *  - rises linearly bedDb→peakDb over startAnchorMs..peakAnchorMs
 *  - executes explicit ending intent as one continuous phrase, with only a short terminal fade
 *  - smooths legacy outro tails without the old peak→bed gain discontinuity
 *  - hard-zeros during the silence drop window (highest priority)
 *
 * The expression is used with `eval=frame` so it updates per-sample.
 */
export function buildGainExpr(p: GainEnvelopeParams): string {
  const db = (x: number) => `pow(10,(${x.toFixed(3)})/20)`
  const a = p.startAnchorMs / 1000
  const pk = p.peakAnchorMs / 1000
  // Short fade only to avoid a click on the first sample — NOT a dramatic swell-up. A 2s fade made the
  // opening read as silent (owner 2026-07-10: "feels so silent at the beginning" / wants intensity from
  // frame one). The bed should be present within a few frames; tension comes from level + the sound
  // designer's opening texture, not from ramping up out of silence.
  const fadeIn = 0.25 // seconds

  const bedGain = 10 ** (p.bedDb / 20)
  const peakGain = 10 ** (p.peakDb / 20)
  const gainAt = (sec: number): number => {
    if (sec < fadeIn) return (sec / fadeIn) * bedGain
    if (sec < a) return bedGain
    if (sec < pk) return bedGain + (peakGain - bedGain) * ((sec - a) / (pk - a))
    return peakGain
  }

  const basePiecewise =
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

  let piecewise = basePiecewise
  if (p.ending) {
    const start = p.ending.startMs / 1000
    const voiceEnd = p.ending.voiceEndMs / 1000
    const end = p.ending.endMs / 1000
    const terminalSec = endingTerminalFadeMs(p.ending.shape) / 1000
    const fadeStart = Math.max(voiceEnd, end - terminalSec)
    const carriedGain = p.ending.focus === 'music' ? bedGain : 0
    const settle = smoothLerpExpr(gainAt(start), carriedGain, start, voiceEnd - start)
    const terminal = smoothLerpExpr(carriedGain, 0, fadeStart, end - fadeStart)
    const endingExpr =
      `if(lt(t,${voiceEnd.toFixed(3)}),${settle},` +
        `if(lt(t,${fadeStart.toFixed(3)}),${carriedGain.toFixed(8)},` +
          `if(lt(t,${end.toFixed(3)}),${terminal},0)` +
        `)` +
      `)`
    piecewise = `if(lt(t,${start.toFixed(3)}),${basePiecewise},${endingExpr})`
  } else {
    // Migration path for persisted scripts without ending intent: preserve their held picture, but remove
    // the old instantaneous peak→bed step. The current gain decays continuously to zero across the tail.
    const tail = Math.max(0, p.outroTailMs ?? 0)
    const voiceEnd = (p.durationMs - tail) / 1000
    if (tail > 0 && voiceEnd > 0) {
      const end = p.durationMs / 1000
      const release = smoothLerpExpr(gainAt(voiceEnd), 0, voiceEnd, tail / 1000)
      piecewise = `if(lt(t,${voiceEnd.toFixed(3)}),${basePiecewise},if(lt(t,${end.toFixed(3)}),${release},0))`
    }
  }

  if (!p.silenceDropMs) return piecewise

  const s = p.silenceDropMs.atMs / 1000
  let en = (p.silenceDropMs.atMs + p.silenceDropMs.durationMs) / 1000

  // A silence drop may shade the final spoken clause, but it cannot erase a later, explicitly
  // music-focused hold. Direction has already chosen music as the ending's owner and render QA verifies
  // that choice survives until the terminal release. Clamp an overlapping drop just before voice end so
  // the bed returns for the held closing beat instead of leaving a dead gap.
  if (p.ending?.focus === 'music') {
    en = Math.min(en, p.ending.voiceEndMs / 1000 - 0.001)
    if (en < s) return piecewise
  }

  // silence_drop hard-zeros its bounded window; an explicit music-owned hold resumes afterward.
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

   
  const fn = new Function('_if', `return ${body}`)
  return fn((_cond: boolean, a: number, b: number) => (_cond ? a : b)) as number
}
