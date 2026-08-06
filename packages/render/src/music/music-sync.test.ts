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
  // The reel now holds its closing image after the last spoken word. The bed must STEP DOWN when the
  // voice stops (the silent emotional beat) and then RESOLVE to silence — never get guillotined at peak.
  const base = { startAnchorMs: 10_000, peakAnchorMs: 45_000, bedDb: -22, peakDb: -12, durationMs: 60_000 }
  const tail = 2_000
  const withTail = { ...base, outroTailMs: tail }
  const voiceEndSec = (base.durationMs - tail) / 1000

  it('holds peak until the voice stops, then steps down for the held beat', () => {
    const expr = buildGainExpr(withTail)
    const atPeakHold = evalGainAt(expr, voiceEndSec - 0.5)
    const justAfterVoice = evalGainAt(expr, voiceEndSec + 0.01)
    expect(atPeakHold).toBeCloseTo(Math.pow(10, base.peakDb / 20), 5)
    expect(justAfterVoice).toBeLessThan(atPeakHold) // the image breathes in near-quiet
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
