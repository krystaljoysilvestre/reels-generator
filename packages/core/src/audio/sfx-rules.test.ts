import { describe, it, expect } from 'vitest'
import { isVocalSfxPrompt, dropEventsNear } from './sfx-rules.js'

describe('isVocalSfxPrompt', () => {
  it('flags OVERT/verbal human sounds (the random-voices/laughter complaint)', () => {
    expect(isVocalSfxPrompt('startled gasp')).toBe(true)
    expect(isVocalSfxPrompt('creepy soft laughter')).toBe(true)
    expect(isVocalSfxPrompt('a distant voice calls out')).toBe(true)
    expect(isVocalSfxPrompt('woman screaming far away')).toBe(true)
    expect(isVocalSfxPrompt('a voice says her name')).toBe(true)
  })

  it('ALLOWS quiet non-verbal textures (owner: fine as atmosphere)', () => {
    // These are legitimate horror texture — breath, whisper hush, hum — not a stray person.
    expect(isVocalSfxPrompt('slow distorted breathing')).toBe(false)
    expect(isVocalSfxPrompt('faint whisper texture, no words')).toBe(false)
    expect(isVocalSfxPrompt('low electrical hum from the next room')).toBe(false)
  })

  it('passes non-vocal environmental sounds', () => {
    expect(isVocalSfxPrompt('electricity switch off')).toBe(false)
    expect(isVocalSfxPrompt('phone vibration')).toBe(false)
    expect(isVocalSfxPrompt('door slam')).toBe(false)
    expect(isVocalSfxPrompt('low boom riser into a hit')).toBe(false)
    expect(isVocalSfxPrompt('distant footsteps in an empty hallway')).toBe(false)
  })

  it('matches on word boundaries, not substrings', () => {
    expect(isVocalSfxPrompt('door slam')).toBe(false) // "slam" ≠ "scream"
    expect(isVocalSfxPrompt('wind whistles through a crack')).toBe(false) // "whistles" is not a blocked word
  })
})

describe('dropEventsNear', () => {
  const ev = (atMs: number) => ({ atMs, label: `e${atMs}` })

  it('drops events within the window of a protected time (either side)', () => {
    const out = dropEventsNear([ev(1000), ev(2400), ev(5000)], [2000])
    expect(out.map((e) => e.atMs)).toEqual([5000]) // 1000 and 2400 are within ±1500 of 2000
  })

  it('keeps everything when there are no protected times', () => {
    const events = [ev(0), ev(100)]
    expect(dropEventsNear(events, [])).toEqual(events)
  })

  it('respects a custom window', () => {
    const out = dropEventsNear([ev(1000), ev(2400)], [2000], 500)
    expect(out.map((e) => e.atMs)).toEqual([1000]) // 2400 is within ±500 of 2000; 1000 is not
  })
})
