import { describe, it, expect } from 'vitest'
import { buildSoundDesignerPrompt, SoundDesignSchema, type DesignerScene } from './sound-designer.v1.js'

const SCENES: DesignerScene[] = [
  { idx: 1, isHero: false, mood: ['unease'], location: 'school hallway', narrationText: 'Gabi na noon, wala nang tao sa school.' },
  { idx: 2, isHero: true, mood: ['dread', 'shock'], location: 'restroom', narrationText: 'May sumagot sa likod ko.' },
]

describe('buildSoundDesignerPrompt', () => {
  it('marks hero scenes and includes each scene lead', () => {
    const { system, userMessage } = buildSoundDesignerPrompt('Gabi na noon… May sumagot sa likod ko.', SCENES, 'horror')
    expect(userMessage).toContain('HERO')
    expect(userMessage).toContain('May sumagot sa likod ko')
    expect(system).toMatch(/non-vocal/i)
  })

  it('frames hits as earned, not forced on every hero scene (debiased)', () => {
    const { system, userMessage } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    // No mandate to hit every hero beat; hits are candidates the moment must earn.
    expect(system).not.toMatch(/JUMPSCARES/)
    expect(system).toMatch(/earned|earns/i)
    expect(system).toMatch(/Do NOT force a hit on every hero beat/)
    expect(userMessage).not.toMatch(/needs a jumpscare/)
  })

  it('lets the LLM choose the music character (no hardcoded texture like heartbeat)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/YOU choose its character/)
    expect(system).not.toMatch(/heartbeat/i)
  })

  it('scales the voice budget by genre (horror allows more pivotal voices than non-horror)', () => {
    const horror = buildSoundDesignerPrompt('x', SCENES, 'horror').system
    const lifestyle = buildSoundDesignerPrompt('x', SCENES, 'lifestyle').system
    expect(horror).toMatch(/at most 2/)
    expect(lifestyle).toMatch(/at most 1/)
  })
})

describe('SoundDesignSchema', () => {
  it('accepts a full design and defaults voices to []', () => {
    const parsed = SoundDesignSchema.parse({
      ambient: { packTags: ['restroom'] },
      music: { type: 'low_drone', peakAnchor: 'May sumagot' },
      sfx: [{ anchor: 'sumagot', prompt: 'low boom sting', impactAtEnd: true }],
      silenceDrop: { anchor: 'May sumagot sa likod ko', durationMs: 900 },
    })
    expect(parsed.voices).toEqual([])
    expect(parsed.sfx[0]!.impactAtEnd).toBe(true)
    expect(parsed.sfx[0]!.volumeDb).toBe(-8) // schema default
  })

  it('caps voices at 2', () => {
    const mk = (n: number) => ({
      ambient: { packTags: ['x'] },
      sfx: [],
      voices: Array.from({ length: n }, (_, i) => ({ anchor: `a${i}`, words: 'hi' })),
    })
    expect(() => SoundDesignSchema.parse(mk(2))).not.toThrow()
    expect(() => SoundDesignSchema.parse(mk(3))).toThrow()
  })
})
