import { describe, it, expect } from 'vitest'
import { buildFoleyEvents, type FoleyAsset } from './foley.js'

// Helper: a foley asset for scene `idx` at clip time `clipMs` (clip is `clipDur`s long).
function fa(idx: number, clipMs: number, opts: { clipDur?: number; volumeDb?: number; at?: number; key?: string } = {}): FoleyAsset {
  return {
    storageKey: opts.key ?? `k-s${idx}-${clipMs}`,
    createdAt: new Date(opts.at ?? 1_000_000),
    meta: { foley: true, sceneIdx: idx, clipMs, clipDurationSec: opts.clipDur ?? 5, volumeDb: opts.volumeDb ?? -8 },
  }
}

const SPANS = [
  { idx: 1, startMs: 0, endMs: 8000 },     // 8s scene, 5s clip → rate 0.625, visibleEnd 8000
  { idx: 2, startMs: 8000, endMs: 12000 }, // 4s scene, 5s clip → rate 1, visibleEnd 12000
]

describe('buildFoleyEvents', () => {
  it('maps clip time to reel time via the shared playback math', () => {
    const out = buildFoleyEvents({ foley: [fa(1, 2000)], sceneSpans: SPANS, anchoredAtMs: [] })
    expect(out).toHaveLength(1)
    // rate 0.625 → 0 + 2000/0.625 = 3200
    expect(out[0]!.atMs).toBe(3200)
  })

  it('clamps volumeDb into the realism band [-10,-6]', () => {
    const hot = buildFoleyEvents({ foley: [fa(1, 1000, { volumeDb: 0 })], sceneSpans: SPANS, anchoredAtMs: [] })
    const quiet = buildFoleyEvents({ foley: [fa(1, 1000, { volumeDb: -30 })], sceneSpans: SPANS, anchoredAtMs: [] })
    expect(hot[0]!.volumeDb).toBe(-6)
    expect(quiet[0]!.volumeDb).toBe(-10)
  })

  it('caps at maxPerScene (earliest events win)', () => {
    const foley = [fa(1, 500), fa(1, 1000), fa(1, 1500), fa(1, 2000)]
    const out = buildFoleyEvents({ foley, sceneSpans: SPANS, anchoredAtMs: [], maxPerScene: 2 })
    expect(out).toHaveLength(2)
    // earliest two by reel time
    expect(out.map((e) => e.atMs).sort((a, b) => a - b)).toEqual([800, 1600])
  })

  it('drops an event that maps past the clip visible end (frozen tail)', () => {
    // scene 2: rate 1, visibleEnd 12000. clipMs 4500 → atMs 8000+4500 = 12500 > 12000 → dropped.
    const out = buildFoleyEvents({ foley: [fa(2, 4500)], sceneSpans: SPANS, anchoredAtMs: [] })
    expect(out).toHaveLength(0)
  })

  it('drops foley colliding with a narration-anchored cue (within 1200ms)', () => {
    // scene 1 clipMs 2000 → atMs 3200; anchored cue at 3500 is 300ms away → dropped.
    const out = buildFoleyEvents({ foley: [fa(1, 2000)], sceneSpans: SPANS, anchoredAtMs: [3500] })
    expect(out).toHaveLength(0)
  })

  it('keeps only the newest asset per (sceneIdx, clipMs)', () => {
    const older = fa(1, 2000, { at: 1_000, key: 'old' })
    const newer = fa(1, 2000, { at: 2_000, key: 'new' })
    const out = buildFoleyEvents({ foley: [older, newer], sceneSpans: SPANS, anchoredAtMs: [] })
    expect(out).toHaveLength(1)
    expect(out[0]!.storageKey).toBe('new')
  })

  it('ignores foley for a scene that no longer exists', () => {
    const out = buildFoleyEvents({ foley: [fa(9, 1000)], sceneSpans: SPANS, anchoredAtMs: [] })
    expect(out).toHaveLength(0)
  })
})
