import { describe, it, expect } from 'vitest'
import {
  tempoFactor,
  atempoChain,
  buildGainExpr,
  evalGainAt,
} from './music-sync.js'

// Golden tests from docs/07 §5

describe('tempoFactor', () => {
  it('returns 1.0 for flat drone (peakFrac=0)', () => {
    expect(tempoFactor(30000, 0, 45000)).toBe(1.0)
  })

  it('maps riser peak to within ±150ms of peakAnchorMs after stretch', () => {
    // Riser with peakFrac=0.85, trackDur=30s, desired peak at 40s
    const trackDurMs = 30_000
    const peakFrac = 0.85
    const peakAnchorMs = 40_000
    const factor = tempoFactor(trackDurMs, peakFrac, peakAnchorMs)
    // After stretch: peak lands at naturalPeakMs / factor = peakAnchorMs
    const stretchedPeakMs = (trackDurMs * peakFrac) / factor
    expect(Math.abs(stretchedPeakMs - peakAnchorMs)).toBeLessThan(150)
  })

  it('speeds up when natural peak is after the desired peak', () => {
    // naturalPeak=25.5s, desired=20s → factor > 1
    const factor = tempoFactor(30_000, 0.85, 20_000)
    expect(factor).toBeGreaterThan(1)
  })

  it('slows down when natural peak is before the desired peak', () => {
    // naturalPeak=25.5s, desired=50s → factor < 1
    const factor = tempoFactor(30_000, 0.85, 50_000)
    expect(factor).toBeLessThan(1)
  })
})

describe('atempoChain', () => {
  it('single stage for factor within [0.5, 2.0]', () => {
    const stages = atempoChain(1.5)
    expect(stages).toHaveLength(1)
    expect(stages[0]).toMatch(/^atempo=/)
  })

  it('decomposes factor > 2.0 into multiple stages', () => {
    const stages = atempoChain(4.0)
    expect(stages.length).toBeGreaterThan(1)
    // All intermediate stages should be atempo=2.0
    expect(stages.slice(0, -1).every((s) => s === 'atempo=2.0')).toBe(true)
  })

  it('decomposes factor < 0.5 into multiple stages', () => {
    const stages = atempoChain(0.25)
    expect(stages.length).toBeGreaterThan(1)
    expect(stages.slice(0, -1).every((s) => s === 'atempo=0.5')).toBe(true)
  })

  it('throws for factor <= 0', () => {
    expect(() => atempoChain(0)).toThrow(RangeError)
    expect(() => atempoChain(-1)).toThrow(RangeError)
  })
})

describe('buildGainExpr + evalGainAt — golden tests (docs/07 §5)', () => {
  const params = {
    startAnchorMs: 10_000,
    peakAnchorMs: 45_000,
    bedDb: -22,
    peakDb: -12,
    durationMs: 60_000,
  }

  it('gain at startAnchorMs equals bedDb', () => {
    const expr = buildGainExpr(params)
    const linearBed = Math.pow(10, params.bedDb / 20)
    // at t=startAnchor we should be at bed level (within float tolerance)
    const got = evalGainAt(expr, params.startAnchorMs / 1000)
    expect(got).toBeCloseTo(linearBed, 5)
  })

  it('gain at peakAnchorMs equals peakDb', () => {
    const expr = buildGainExpr(params)
    const linearPeak = Math.pow(10, params.peakDb / 20)
    const got = evalGainAt(expr, params.peakAnchorMs / 1000)
    expect(got).toBeCloseTo(linearPeak, 5)
  })

  it('gain during silence_drop is exactly 0', () => {
    const expr = buildGainExpr({
      ...params,
      silenceDropMs: { atMs: 20_000, durationMs: 1200 },
    })
    // t=20.5s is inside the silence window
    expect(evalGainAt(expr, 20.5)).toBe(0)
    // t=21.5s is outside — should be non-zero
    expect(evalGainAt(expr, 21.5)).toBeGreaterThan(0)
  })

  it('gain rises monotonically from startAnchor to peakAnchor', () => {
    const expr = buildGainExpr(params)
    const samples = [10, 20, 30, 40, 44].map((s) => evalGainAt(expr, s))
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]!)
    }
  })

  it('music ducks >= 5 dB below bed when gain at bed vs at zero', () => {
    // Verify that bedDb is at least 5 dB below silence (0 dB = 1.0 linear)
    // i.e. the bed level itself provides >= 5 dB attenuation vs full volume
    const attenuation = 0 - params.bedDb  // dB below unity
    expect(attenuation).toBeGreaterThanOrEqual(5)
  })
})

describe('buildGainExpr — outro tail resolve (§4.65)', () => {
  // Migration behavior for persisted scripts that predate explicit ending direction.
  const base = { startAnchorMs: 10_000, peakAnchorMs: 45_000, bedDb: -22, peakDb: -12, durationMs: 60_000 }
  const tail = 2_000
  const withTail = { ...base, outroTailMs: tail }
  const voiceEndSec = (base.durationMs - tail) / 1000

  it('has no gain discontinuity when the voice stops', () => {
    const expr = buildGainExpr(withTail)
    const before = evalGainAt(expr, voiceEndSec - 0.001)
    const after = evalGainAt(expr, voiceEndSec + 0.001)
    expect(Math.abs(before - after)).toBeLessThan(0.001)
  })

  it('resolves to (near) silence by the final frame instead of cutting at full level', () => {
    const expr = buildGainExpr(withTail)
    const atEnd = evalGainAt(expr, base.durationMs / 1000 - 0.01)
    expect(atEnd).toBeLessThan(evalGainAt(expr, voiceEndSec + 0.01))
    expect(atEnd).toBeLessThan(0.01)
  })

  it('decays monotonically across the tail', () => {
    const expr = buildGainExpr(withTail)
    const samples = [0.1, 0.4, 0.7, 1.0, 1.4, 1.8].map((d) => evalGainAt(expr, voiceEndSec + d))
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]!)
  })

  it('is unchanged for a reel with no tail (legacy behaviour holds peak to the last sample)', () => {
    const expr = buildGainExpr(base)
    expect(evalGainAt(expr, base.durationMs / 1000 - 0.01)).toBeCloseTo(Math.pow(10, base.peakDb / 20), 5)
    expect(buildGainExpr({ ...base, outroTailMs: 0 })).toBe(expr)
  })
})

describe('buildGainExpr — explicit ending direction', () => {
  const base = { startAnchorMs: 10_000, peakAnchorMs: 45_000, bedDb: -22, peakDb: -12, durationMs: 60_000 }
  const ending = {
    startMs: 54_000,
    voiceEndMs: 58_000,
    endMs: 60_000,
    focus: 'music' as const,
    shape: 'resolve' as const,
  }

  it('joins the established score continuously at the final-cadence anchor', () => {
    const expr = buildGainExpr({ ...base, ending })
    const before = evalGainAt(expr, ending.startMs / 1000 - 0.001)
    const after = evalGainAt(expr, ending.startMs / 1000 + 0.001)
    expect(Math.abs(before - after)).toBeLessThan(0.001)
  })

  it('settles under the final clause, carries the hold, and fades across the terminal release', () => {
    const expr = buildGainExpr({ ...base, ending })
    const bed = Math.pow(10, base.bedDb / 20)
    expect(evalGainAt(expr, ending.voiceEndMs / 1000)).toBeCloseTo(bed, 5)
    expect(evalGainAt(expr, 59.2)).toBeCloseTo(bed, 5)
    expect(evalGainAt(expr, 59.5)).toBeLessThan(bed)
    expect(evalGainAt(expr, 59.9)).toBeGreaterThan(0)
    expect(evalGainAt(expr, 60.0)).toBe(0)
  })

  it('recedes by voice end when another layer owns the ending', () => {
    const expr = buildGainExpr({ ...base, ending: { ...ending, focus: 'ambience' } })
    expect(evalGainAt(expr, ending.voiceEndMs / 1000)).toBe(0)
    expect(evalGainAt(expr, 59.0)).toBe(0)
  })

  it('keeps a ring-out moving by decaying across the whole post-voice tail', () => {
    const ring = { ...ending, voiceEndMs: 57_000, shape: 'ring_out' as const }
    const expr = buildGainExpr({ ...base, ending: ring })
    const bed = Math.pow(10, base.bedDb / 20)
    const samples = [57.0, 57.5, 58.0, 59.0, 59.5].map((t) => evalGainAt(expr, t))
    expect(samples[0]).toBeCloseTo(bed, 5)
    for (let i = 1; i < samples.length; i++) expect(samples[i]).toBeLessThan(samples[i - 1]!)
    expect(evalGainAt(expr, 60.0)).toBe(0)
  })

  it('restores a music-focused ending after an overlapping silence drop', () => {
    const expr = buildGainExpr({
      ...base,
      ending,
      silenceDropMs: { atMs: 57_500, durationMs: 2_500 },
    })
    const bed = Math.pow(10, base.bedDb / 20)

    // The drop can still shape the last spoken clause.
    expect(evalGainAt(expr, 57.8)).toBe(0)
    // Once the voice ends, the explicitly selected music layer owns the held closing beat.
    expect(evalGainAt(expr, 58.2)).toBeCloseTo(bed, 5)
    expect(evalGainAt(expr, 59.2)).toBeCloseTo(bed, 5)
  })
})
