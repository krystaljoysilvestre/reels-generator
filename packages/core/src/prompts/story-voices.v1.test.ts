import { describe, it, expect } from 'vitest'
import { STORY_VOICES, VOICE_VALUES, resolveVoice, renderVoice } from './story-voices.v1.js'

describe('story-voices', () => {
  it('VOICE_VALUES matches the catalog keys and includes the named set', () => {
    expect(VOICE_VALUES.length).toBe(Object.keys(STORY_VOICES).length)
    for (const v of ['confessional', 'conversational', 'deadpan', 'documentary', 'diary', 'campfire']) {
      expect(VOICE_VALUES).toContain(v)
    }
  })
  it('resolveVoice returns null for empty/unknown (→ identity default) and a spec for known', () => {
    expect(resolveVoice('')).toBeNull()
    expect(resolveVoice(undefined)).toBeNull()
    expect(resolveVoice('nonsense')).toBeNull()
    expect(resolveVoice('deadpan')?.label).toBe('Deadpan')
  })
  it('renderVoice states it overrides the default and is judgment-framed', () => {
    const out = renderVoice(STORY_VOICES.confessional!)
    expect(out).toMatch(/overrides your default/i)
    expect(out).toMatch(/story still outranks/i)
  })
})
