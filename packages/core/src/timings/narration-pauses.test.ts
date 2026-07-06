import { describe, it, expect } from 'vitest'
import { planNarrationPauses, resolvePauses, applyPausesToAlignment, type NarrationBeat, type NarrationPause } from './narration-pauses.js'
import type { AlignedChar } from '../types/timings.js'

// A two-scene horror narration. Scene 2 (the payoff) has two sentences → a reveal beat before the last.
const S1 = 'Tahimik ang bahay.'
const S2 = 'May tao sa likod ko. Nakangiti.'
const NARRATION = `${S1}\n${S2}`

describe('planNarrationPauses', () => {
  it('returns no beats for non-horror genres', () => {
    expect(planNarrationPauses(NARRATION, [S1, S2], 'lifestyle')).toEqual([])
    expect(planNarrationPauses(NARRATION, [S1, S2], undefined)).toEqual([])
  })

  it('places a payoff lead-in before the final scene and a reveal beat before its last sentence', () => {
    const beats = planNarrationPauses(NARRATION, [S1, S2], 'horror')
    const reasons = beats.map((b) => b.reason)
    expect(reasons).toContain('payoff-leadin')
    expect(reasons).toContain('reveal')
    // The reveal beat wants the most silence.
    const reveal = beats.find((b) => b.reason === 'reveal')!
    expect(reveal.targetMs).toBe(Math.max(...beats.map((b) => b.targetMs)))
    // The reveal beat sits at the start of the last sentence ("Nakangiti.").
    const revealCp = Array.from(NARRATION).slice(reveal.cpIndex).join('')
    expect(revealCp.startsWith('Nakangiti')).toBe(true)
  })

  it('returns beats sorted by cpIndex with no duplicate indices', () => {
    const beats = planNarrationPauses(NARRATION, [S1, S2], 'horror')
    const idxs = beats.map((b) => b.cpIndex)
    expect(idxs).toEqual([...idxs].sort((a, b) => a - b))
    expect(new Set(idxs).size).toBe(idxs.length)
  })
})

// 10ms-per-char alignment, but with a controllable gap injected before a chosen index.
function alignmentWithGap(text: string, gapBeforeIdx: number, gapMs: number): AlignedChar[] {
  const chars = Array.from(text)
  const out: AlignedChar[] = []
  let t = 0
  chars.forEach((ch, i) => {
    if (i === gapBeforeIdx) t += gapMs // natural silence before this char
    out.push({ ch, startMs: t, endMs: t + 10 })
    t += 10
  })
  return out
}

describe('resolvePauses (target-based top-up)', () => {
  const beats: NarrationBeat[] = [{ cpIndex: 5, targetMs: 1000, reason: 'reveal' }]

  it('adds only the shortfall when a natural gap already exists', () => {
    const align = alignmentWithGap('abcdefgh', 5, 400) // 400ms natural gap before index 5
    const pauses = resolvePauses(beats, align)
    expect(pauses).toEqual([{ cpIndex: 5, durationMs: 600, reason: 'reveal' }]) // 1000 - 400
  })

  it('adds nothing when the natural gap already meets the target', () => {
    const align = alignmentWithGap('abcdefgh', 5, 1200) // already over target
    expect(resolvePauses(beats, align)).toEqual([])
  })

  it('adds the full target when there is no natural gap', () => {
    const align = alignmentWithGap('abcdefgh', 5, 0)
    expect(resolvePauses(beats, align)).toEqual([{ cpIndex: 5, durationMs: 1000, reason: 'reveal' }])
  })
})

// Build a trivial 1ms-per-char alignment so shifts are easy to reason about.
function fakeAlignment(text: string): AlignedChar[] {
  return Array.from(text).map((ch, i) => ({ ch, startMs: i * 10, endMs: i * 10 + 10 }))
}

describe('applyPausesToAlignment', () => {
  const align = fakeAlignment('abcdef') // 6 chars, 0..60ms
  const duration = 60

  it('is a no-op with no pauses', () => {
    const r = applyPausesToAlignment(align, duration, [])
    expect(r.alignment).toBe(align)
    expect(r.durationMs).toBe(60)
    expect(r.insertions).toEqual([])
  })

  it('shifts only chars at/after the pause index and extends duration', () => {
    const pauses: NarrationPause[] = [{ cpIndex: 3, durationMs: 500, reason: 'reveal' }]
    const r = applyPausesToAlignment(align, duration, pauses)
    // chars 0,1,2 unchanged; chars 3,4,5 shifted +500
    expect(r.alignment[2]!.startMs).toBe(20)
    expect(r.alignment[3]!.startMs).toBe(30 + 500)
    expect(r.alignment[5]!.endMs).toBe(60 + 500)
    expect(r.durationMs).toBe(560)
    // silence spliced at char 3's ORIGINAL start (30ms)
    expect(r.insertions).toEqual([{ atMsOriginal: 30, durationMs: 500 }])
  })

  it('accumulates multiple pauses correctly', () => {
    const pauses: NarrationPause[] = [
      { cpIndex: 2, durationMs: 100, reason: 'scene-breath' },
      { cpIndex: 4, durationMs: 200, reason: 'reveal' },
    ]
    const r = applyPausesToAlignment(align, duration, pauses)
    expect(r.alignment[1]!.startMs).toBe(10)         // before both
    expect(r.alignment[2]!.startMs).toBe(20 + 100)   // after first only
    expect(r.alignment[4]!.startMs).toBe(40 + 300)   // after both
    expect(r.durationMs).toBe(360)
    expect(r.insertions).toEqual([
      { atMsOriginal: 20, durationMs: 100 },
      { atMsOriginal: 40, durationMs: 200 },
    ])
  })

  it('preserves alignment length (M10 invariant) and the ch field', () => {
    const pauses: NarrationPause[] = [{ cpIndex: 1, durationMs: 300, reason: 'scene-breath' }]
    const r = applyPausesToAlignment(align, duration, pauses)
    expect(r.alignment.length).toBe(align.length)
    expect(r.alignment.map((c) => c.ch).join('')).toBe('abcdef')
  })
})
