import { describe, it, expect } from 'vitest'
import { moodToVoiceSettings } from './voice-settings.js'
import type { ToneConfig } from '../types/channel.js'

const neutralTone: ToneConfig = { intensity: 5, warmth: 5, energy: 5, pacing: 5, humor: 3 }

describe('moodToVoiceSettings', () => {
  it('returns valid in-range ElevenLabs voice_settings', () => {
    const s = moodToVoiceSettings([], neutralTone)
    expect(s.stability).toBeGreaterThanOrEqual(0.2)
    expect(s.stability).toBeLessThanOrEqual(0.85)
    expect(s.style).toBeGreaterThanOrEqual(0)
    expect(s.style).toBeLessThanOrEqual(0.6)
    expect(s.speed).toBeGreaterThanOrEqual(0.8)
    expect(s.speed).toBeLessThanOrEqual(1.12)
    expect(s.similarity_boost).toBe(0.75)
    expect(s.use_speaker_boost).toBe(true)
  })

  it('delivers dread more expressively (lower stability) + no faster than calm', () => {
    const dread = moodToVoiceSettings(['dread', 'eerie'], neutralTone)
    const calm = moodToVoiceSettings(['calm', 'gentle'], neutralTone)
    expect(dread.stability).toBeLessThan(calm.stability)
    expect(dread.speed).toBeLessThanOrEqual(calm.speed)
  })

  it('energetic mood adds drama (higher style) + faster pace', () => {
    const hype = moodToVoiceSettings(['energetic', 'thrilling'], neutralTone)
    const base = moodToVoiceSettings([], neutralTone)
    expect(hype.style).toBeGreaterThan(base.style)
    expect(hype.speed).toBeGreaterThan(base.speed)
  })

  it('higher channel intensity → lower baseline stability', () => {
    const calmChannel = moodToVoiceSettings([], { ...neutralTone, intensity: 1 })
    const intenseChannel = moodToVoiceSettings([], { ...neutralTone, intensity: 10 })
    expect(intenseChannel.stability).toBeLessThan(calmChannel.stability)
  })

  it('clamps under extreme tone + stacked moods', () => {
    const extreme: ToneConfig = { intensity: 10, warmth: 0, energy: 10, pacing: 10, humor: 0 }
    const s = moodToVoiceSettings(['dread', 'intense', 'epic'], extreme)
    expect(s.stability).toBeGreaterThanOrEqual(0.2)
    expect(s.speed).toBeLessThanOrEqual(1.12)
    expect(s.style).toBeLessThanOrEqual(0.6)
  })
})
