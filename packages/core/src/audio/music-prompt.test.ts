import { describe, expect, it } from 'vitest'
import { buildMusicPrompt, planMusicGeneration } from './music-prompt.js'

describe('planMusicGeneration', () => {
  it('adds safe headroom and keeps story anchors on the reel timeline for a music-owned ending', () => {
    const plan = planMusicGeneration({
      durationMs: 99_197,
      peakAnchorMs: 70_000,
      ending: { voiceEndMs: 96_596, focus: 'music' },
    })
    expect(plan.lengthMs).toBe(111_197)
    expect(plan.loops).toBe(false)
    expect(plan.peakFrac).toBeCloseTo(70_000 / 111_197, 6)
    expect(plan.resolveFrac).toBeCloseTo(96_596 / 111_197, 6)
  })

  it('does not buy headroom when another layer owns the ending', () => {
    const plan = planMusicGeneration({
      durationMs: 99_197,
      peakAnchorMs: 70_000,
      ending: { voiceEndMs: 96_596, focus: 'ambience' },
    })
    expect(plan.lengthMs).toBe(99_197)
    expect(plan.resolveFrac).toBeUndefined()
  })

  it('requests a seamless no-fade bed when the provider ceiling leaves too little headroom', () => {
    const plan = planMusicGeneration({
      durationMs: 295_000,
      ending: { voiceEndMs: 292_000, focus: 'music' },
    })
    expect(plan.lengthMs).toBe(300_000)
    expect(plan.loops).toBe(true)
    expect(plan.resolveFrac).toBeUndefined()
  })
})

describe('buildMusicPrompt', () => {
  it('places a story-directed resolution before provider headroom and forbids a baked fade', () => {
    const prompt = buildMusicPrompt({
      toneIntensity: 5,
      nicheDescription: 'documentary stories',
      moodTags: ['reflective'],
      musicType: 'drone_swell',
      peakFrac: 0.63,
      resolveFrac: 0.87,
    })
    expect(prompt).toContain('Around 87% of the way through')
    expect(prompt).toContain('Sustain that resolved sound clearly')
    expect(prompt).toContain('no fade-out')
  })
})
