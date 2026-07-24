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

  it('pushes DENSE scene-reliving realism, not sparseness (fixes the flat output)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    // Every concrete action the narration names is a cue candidate; a 4-5 sound reel is called out as under-heard.
    expect(system).toMatch(/EVERY concrete physical action/i)
    expect(system).toMatch(/under-heard/i)
    expect(system).toMatch(/believable|ordinary reality|real place/i)
  })

  it('teaches the SUSTAINED layer (endAnchor loops: heartbeat under a walk, corridor tone under a scene)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/SUSTAINED/i)
    expect(system).toMatch(/endAnchor/)
    expect(system).toMatch(/heartbeat/i)
    expect(system).toMatch(/seamless loop/i)
    // (The user-message JSON example is now the register-NEUTRAL shape guide — Phase B — so it no longer
    // models a sustained cue; the sustained-layer teaching lives in the system prompt, asserted above.)
  })

  it('demands FULL presence from frame one — no ease-in/build-up, a sustained opening tension texture', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/FIRST SECOND at FULL presence/i)
    expect(system).toMatch(/do NOT ease in from quiet|slowly-warming-up opening is a failure/i)
    expect(system).toMatch(/SUSTAINED tension texture/i)
  })

  it('restrains to ONE climax (not zero, not every beat) — no forced jumpscares', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).not.toMatch(/JUMPSCARES/)
    // Restraint = one hit, not a hit on every beat...
    expect(system).toMatch(/resist a (full )?hit on every beat/i)
    // ...but that one climax is mandatory (the v1.4 fix — not left in silence).
    expect(system).toMatch(/non-negotiable|one climax/i)
  })

  it('lets the LLM choose the music character (no hardcoded music texture)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/choose music'?s character/i)
    // The music guidance (layer 1) must not prescribe one texture. (Heartbeat appears later ONLY as a
    // judgment-framed example for the sustained SFX layer — that's allowed; a forced music bed isn't.)
    const musicLine = system.split('\n').find((l) => l.includes("music's character"))!
    expect(musicLine).not.toMatch(/heartbeat/i)
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

  it('gives EVERY genre a distinct, non-empty context block (not horror-only)', () => {
    const horror = buildSoundDesignerPrompt('x', SCENES, 'horror').system
    const info = buildSoundDesignerPrompt('x', SCENES, 'informational').system
    const life = buildSoundDesignerPrompt('x', SCENES, 'lifestyle').system
    const general = buildSoundDesignerPrompt('x', SCENES).system
    expect(horror).toMatch(/ordinary reality/i)
    expect(info).toMatch(/teaches or reveals|comprehension/i)
    expect(life).toMatch(/warmth|intimacy/i)
    expect(general).toMatch(/own register/i)
    // The old generic one-sentence fallback is gone.
    expect(info).not.toMatch(/Build a believable, immersive world of sound that serves the story\./)
  })

  it('keeps horror-only craft language out of non-horror prompts', () => {
    const horror = buildSoundDesignerPrompt('x', SCENES, 'horror').system
    const life = buildSoundDesignerPrompt('x', SCENES, 'lifestyle').system
    expect(horror).toMatch(/never feels safe/i)
    expect(life).not.toMatch(/never feels safe/i)
  })

  it('frames the peak as a genre-neutral emotional climax, not a horror-only scare', () => {
    const info = buildSoundDesignerPrompt('x', SCENES, 'informational').system
    expect(info).toMatch(/emotional climax/i)
    expect(info).toMatch(/revelation/i) // informational context names its own kind of climax
  })

  it('teaches duration + loudness as principles and names the schema field', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    // Duration taught as intent, and the JSON field is present.
    expect(system).toMatch(/shortest duration/i)
    expect(system).toMatch(/targetDurationSec/)
    // Loudness taught relative-first (psychology), climax loudest, texture barely noticeable.
    expect(system).toMatch(/barely noticeable/i)
    expect(system).toMatch(/loudest single sound/i)
    expect(system).toMatch(/feel inevitable/i)
  })

  it('treats silence as a SET-UP for the hit, not a replacement for it', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/wind-up|set up the climax|held breath/i)
    // Silence must not be sold as a valid payoff on its own.
    expect(system).toMatch(/not a substitute for the hit|missed payoff/i)
  })

  it('states the universal mission for EVERY genre: physically present, sound reconstructs the experience', () => {
    for (const g of ['horror', 'informational', 'lifestyle', undefined]) {
      const { system } = buildSoundDesignerPrompt('x', SCENES, g as string | undefined)
      expect(system).toMatch(/PHYSICALLY PRESENT/i)
      expect(system).toMatch(/RECONSTRUCTS the experience/i)
    }
  })

  it('names each genre\'s experience (unsafe / curiosity / intimacy)', () => {
    expect(buildSoundDesignerPrompt('x', SCENES, 'horror').system).toMatch(/experience here is UNSAFE/i)
    expect(buildSoundDesignerPrompt('x', SCENES, 'informational').system).toMatch(/experience here is CURIOSITY/i)
    expect(buildSoundDesignerPrompt('x', SCENES, 'lifestyle').system).toMatch(/experience here is INTIMACY/i)
  })

  it('opens genre-neutrally (emotional world, not horror\'s "something is off")', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'lifestyle')
    expect(system).toMatch(/establish the story's emotional world within the first second/i)
    expect(system).not.toMatch(/something is off/i)
  })

  it('teaches sonic ideas as a principle + callbacks, not a stock device list', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/Repetition creates familiarity/i)
    expect(system).toMatch(/CHANGE creates emotion/i)
    expect(system).toMatch(/CALLBACKS/i)
    expect(system).toMatch(/introduce an idea, develop it, call it back, resolve it/i)
    // The overused stock devices are no longer prescribed.
    expect(system).not.toMatch(/reverse swell|tape hiss|metallic resonance/i)
  })

  it('makes music movement decisive: stories with a turn take swell/riser, never low_drone', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/character AND MOVEMENT/i)
    expect(system).toMatch(/low_drone is valid ONLY for a piece that truly sits still/i)
    expect(system).toMatch(/never low_drone/i)
  })

  it('anchors realism density (~8–14 cues typical; 4-5 flagged as under-heard)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/8–14 cues|8-14 cues/i)
    expect(system).toMatch(/under-heard/i)
  })

  it('demands a top-of-range jumpscare for horror — WEIGHT not shrillness (no painful screech)', () => {
    const horror = buildSoundDesignerPrompt('x', SCENES, 'horror').system
    const info = buildSoundDesignerPrompt('x', SCENES, 'informational').system
    expect(horror).toMatch(/JUMPSCARE/)
    expect(horror).toMatch(/\+4\.\.\+6/)
    expect(horror).toMatch(/flinch/i)
    // The de-harsh fix: power is weight; harsh high-frequency screeches are banned.
    expect(horror).toMatch(/power is WEIGHT/i)
    expect(horror).toMatch(/NEVER a thin, harsh, high-pitched screech|metallic shriek/i)
    // Info never DEMANDS a jumpscare. (The register-first override, now default on every prompt, mentions
    // "jumpscare" only to FORBID it for non-tense registers — a prohibition, not a demand — so we assert on
    // the horror-only demand phrasing, not the bare word.)
    expect(info).not.toMatch(/climax is a JUMPSCARE/i)
  })

  it('forbids a sagging ending — aftermath to the last word, closing sting allowed', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'lifestyle')
    expect(system).toMatch(/ENDING THAT HOLDS/i)
    expect(system).toMatch(/closing sting/i)
    expect(system).toMatch(/never let the last scene play out over dead, empty air/i)
  })

  it('makes the climax payoff mandatory and audible (not left in silence) — for a tense register', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/CLIMAX MUST MAKE A SOUND|must make a sound/i)
    expect(system).toMatch(/non-negotiable/i)
    // The system rule pushes impactAtEnd for the climax. (The register-first override, default now, scopes
    // "climax non-negotiable" to a TENSE register; a calm register lands the peak on a fact, not a hit.)
    expect(system).toMatch(/impactAtEnd=true/)
  })

  it('uses no forced-quota language (unbiased-design)', () => {
    const { system } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).not.toMatch(/place \d+|on every (hero|scene|twist)|a sting on each/i)
  })

  it('applies register-first by DEFAULT (Phase B): override present, example neutral, calm stays PRESENT', () => {
    // Register-first is unconditional now — every prompt (even horror) gets the override that scopes the tense
    // mandates to a tense register, and a register-neutral JSON example (no horror literals to copy).
    const { system, userMessage } = buildSoundDesignerPrompt('x', SCENES, 'horror')
    expect(system).toMatch(/REGISTER FIRST/)
    expect(system).toMatch(/SILENTLY decide/i)
    // The founder's "leans calm" steer: calm is a register, not an absence.
    expect(system).toMatch(/CALM IS NOT SILENT/i)
    // The user message uses the neutral shape guide (not the old horror "province_night" example) and keeps
    // a calm register present.
    expect(userMessage).not.toMatch(/province_night/)
    expect(userMessage).toMatch(/still PRESENT/i)
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

  const oneCue = (extra: Record<string, unknown>) =>
    SoundDesignSchema.parse({
      ambient: { packTags: ['x'] },
      sfx: [{ anchor: 'a', prompt: 'p', ...extra }],
    }).sfx[0]!

  it('clamps targetDurationSec into [1, 22] and leaves it undefined when absent', () => {
    expect(oneCue({ targetDurationSec: 0.5 }).targetDurationSec).toBe(1)
    expect(oneCue({ targetDurationSec: 30 }).targetDurationSec).toBe(22)
    expect(oneCue({ targetDurationSec: 12 }).targetDurationSec).toBe(12)
    expect(oneCue({}).targetDurationSec).toBeUndefined()
  })

  it('passes endAnchor through for sustained cues and leaves it undefined otherwise', () => {
    expect(oneCue({ endAnchor: 'a later line' }).endAnchor).toBe('a later line')
    expect(oneCue({}).endAnchor).toBeUndefined()
  })

  it('clamps volumeDb into [-30, +9] rather than rejecting out-of-range values', () => {
    expect(oneCue({ volumeDb: -100 }).volumeDb).toBe(-30)
    expect(oneCue({ volumeDb: 50 }).volumeDb).toBe(9) // ceiling raised to +9 for the traumatic climax
    expect(oneCue({ volumeDb: 3 }).volumeDb).toBe(3)
    expect(oneCue({}).volumeDb).toBe(-8) // default preserved
  })
})
