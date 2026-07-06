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
  })

  it('pushes DENSE believable realism, not sparseness (fixes the flat output)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/DENSE|BE GENEROUS/i)
    expect(system).toMatch(/believable|ordinary reality|real place/i)
    // The 90/10 balance — mostly reality, sparingly overt.
    expect(system).toMatch(/nine parts|9.*1|believable world/i)
  })

  it('keeps the overt layer restrained — builds to one felt payoff, hits earned not forced', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).not.toMatch(/JUMPSCARES/)
    expect(system).toMatch(/one .*payoff|one earned payoff|Resist a hit|only the moment that truly turns/i)
    expect(system).toMatch(/earn/i)
  })

  it('lets the LLM choose the music character (no hardcoded texture like heartbeat)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/choose music'?s character/i)
    expect(system).not.toMatch(/heartbeat/i)
  })

  it('allows quiet non-verbal textures but bans overt vocal sfx', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/breath|whisper/i)          // textures are on the palette
    expect(system).toMatch(/never sfx/i)               // words/laughter/screams are not
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
