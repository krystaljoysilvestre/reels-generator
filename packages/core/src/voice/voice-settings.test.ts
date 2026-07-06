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

  it('delivers dread as steady + unhurried, not erratic', () => {
    const dread = moodToVoiceSettings(['dread', 'eerie'], neutralTone)
    const base = moodToVoiceSettings([], neutralTone)
    // Controlled dread reads as MORE stable than a neutral read — low stability on ElevenLabs causes the
    // rushing/stutter we're fixing. And it should be no faster (slow, deliberate).
    expect(dread.stability).toBeGreaterThan(base.stability)
    expect(dread.speed).toBeLessThan(base.speed)
    expect(dread.style).toBeLessThanOrEqual(base.style + 0.05) // low drama, no theatrical wobble
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

  it('horror envelope holds even with NO mood tags (the original jolly-voice failure)', () => {
    // With no dread tag the old logic gave stability ~0.47 / style ~0.3 / speed ~0.96 — the erratic,
    // theatrical, slightly-fast read that sounded jolly. The genre envelope must floor stability, cap
    // drama, and hold the pace down regardless of what the mood tagger emits.
    const horror = moodToVoiceSettings([], neutralTone, 'horror')
    expect(horror.stability).toBeGreaterThanOrEqual(0.5)
    expect(horror.style).toBeLessThanOrEqual(0.15)
    expect(horror.speed).toBeLessThanOrEqual(0.95)
  })

  it('horror envelope caps an energetic-tagged story (never rushes or turns theatrical)', () => {
    const extreme: ToneConfig = { intensity: 10, warmth: 0, energy: 10, pacing: 10, humor: 0 }
    const s = moodToVoiceSettings(['energetic', 'thrilling', 'epic'], extreme, 'horror')
    expect(s.stability).toBeGreaterThanOrEqual(0.5)
    expect(s.style).toBeLessThanOrEqual(0.15)
    expect(s.speed).toBeLessThanOrEqual(0.95)
  })

  it('genre bands differ: horror is steadier + slower + less dramatic than lifestyle', () => {
    // Use an intense tone so all three axes diverge (at neutral tone the horror/lifestyle stability bands
    // both admit 0.55 and tie — the bands only separate on stability once the baseline is pushed low).
    const intense: ToneConfig = { ...neutralTone, intensity: 8, energy: 8, pacing: 8 }
    const horror = moodToVoiceSettings([], intense, 'horror')
    const lifestyle = moodToVoiceSettings([], intense, 'lifestyle')
    expect(horror.stability).toBeGreaterThan(lifestyle.stability)
    expect(horror.style).toBeLessThan(lifestyle.style)
    expect(horror.speed).toBeLessThan(lifestyle.speed)
  })

  it("'general' and unknown genres apply no envelope (tone/mood drive it)", () => {
    const withGeneral = moodToVoiceSettings(['energetic'], neutralTone, 'general')
    const noGenre = moodToVoiceSettings(['energetic'], neutralTone)
    expect(withGeneral).toEqual(noGenre)
  })
})
