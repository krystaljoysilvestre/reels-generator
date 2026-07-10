import { describe, it, expect } from 'vitest'
import { choreographClimax, type ChoreoScene } from './climax-choreography.js'
import type { SfxCue } from '../types/audio-script.js'

const scenes: ChoreoScene[] = [
  { idx: 1, isHero: true, narrationText: 'Gabi na sa eskwelahan. Wala nang tao.' },
  { idx: 2, isHero: false, narrationText: 'Naglakad ako papunta sa banyo sa likod.' },
  { idx: 3, isHero: false, narrationText: 'May narinig akong yabag. Tumigil ako sandali.' },
  { idx: 4, isHero: true, narrationText: 'Paglingon ko may babae. Nakatingin sa akin.' }, // payoff (last hero)
]

const cue = (over: Partial<SfxCue>): SfxCue => ({ anchor: 'x', offsetMs: 0, prompt: 'p', volumeDb: -8, impactAtEnd: false, ...over })

describe('choreographClimax', () => {
  it('re-anchors the climax onto the payoff scene as a SUDDEN top-of-range slam (no build)', () => {
    const climax = cue({ anchor: 'Tumigil ako sandali', prompt: 'boom', volumeDb: 5, impactAtEnd: true })
    const r = choreographClimax({ sfx: [cue({ anchor: 'Naglakad ako' }), climax], silenceDrop: null, scenes })
    expect(r.payoffAnchor).toMatch(/^Paglingon ko may babae/)
    // The climax was the built-up cue; it's now on the payoff, sudden (no build), top-of-range (+9).
    const moved = r.sfx.find((c) => c.volumeDb === 9)!
    expect(moved.anchor).toBe(r.payoffAnchor)
    expect(moved.impactAtEnd).toBe(false)
    expect(moved.prompt).toMatch(/slam|bang/i)
    // Present/cutting, explicitly not a soft sub-rumble.
    expect(moved.prompt).toMatch(/PRESENT|CUTTING/)
    expect(moved.prompt).toMatch(/not a soft deep sub-bass rumble/i)
  })

  it('places a silence beat on the tail of the scene BEFORE the payoff', () => {
    const climax = cue({ prompt: 'boom', volumeDb: 6, impactAtEnd: true, anchor: 'foo' })
    const r = choreographClimax({ sfx: [climax], silenceDrop: null, scenes })
    expect(r.silenceAnchor).not.toBeNull()
    // From scene 3 (the one before the payoff scene 4).
    expect(scenes[2]!.narrationText.includes(r.silenceAnchor!)).toBe(true)
    expect(r.silenceDrop!.anchor).toBe(r.silenceAnchor)
  })

  it('clamps a sustained texture that runs into the payoff to stop at the silence', () => {
    const dread = cue({ anchor: 'Gabi na', endAnchor: 'Nakatingin sa akin', prompt: 'dread loop' }) // ends IN payoff scene
    const climax = cue({ prompt: 'boom', volumeDb: 6, impactAtEnd: true, anchor: 'z' })
    const r = choreographClimax({ sfx: [dread, climax], silenceDrop: null, scenes })
    const clamped = r.sfx.find((c) => c.prompt === 'dread loop')!
    expect(clamped.endAnchor).toBe(r.silenceAnchor) // no longer runs into the payoff
  })

  it('leaves a sustained texture that ends BEFORE the payoff untouched', () => {
    const midHum = cue({ anchor: 'Naglakad ako', endAnchor: 'Tumigil ako sandali', prompt: 'hum loop' }) // ends in scene 3
    const climax = cue({ prompt: 'boom', volumeDb: 6, impactAtEnd: true, anchor: 'z' })
    const r = choreographClimax({ sfx: [midHum, climax], silenceDrop: null, scenes })
    const hum = r.sfx.find((c) => c.prompt === 'hum loop')!
    expect(hum.endAnchor).toBe('Tumigil ako sandali') // unchanged
  })

  it('no-ops when there is no genuine hit (all cues quiet, none build)', () => {
    const sfx = [cue({ anchor: 'Naglakad ako', volumeDb: -8 })]
    const r = choreographClimax({ sfx, silenceDrop: null, scenes })
    expect(r.payoffAnchor).toBeNull()
    expect(r.sfx).toEqual(sfx)
  })

  it('falls back to the last scene when no scene is hero', () => {
    const flat = scenes.map((s) => ({ ...s, isHero: false }))
    const climax = cue({ prompt: 'boom', volumeDb: 6, impactAtEnd: true, anchor: 'z' })
    const r = choreographClimax({ sfx: [climax], silenceDrop: null, scenes: flat })
    expect(r.payoffAnchor).toMatch(/^Paglingon ko may babae/) // last scene
  })
})
