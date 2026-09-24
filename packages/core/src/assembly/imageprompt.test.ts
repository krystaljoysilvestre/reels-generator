import { describe, it, expect } from 'vitest'
import { assembleImagePrompt, castNationality, historicalEraDirective } from './imageprompt.js'
import { StoryBibleSchema, EMPTY_STORY_BIBLE, type StoryBible } from '../types/story-bible.js'

const STYLE = 'grainy 16mm horror still, desaturated palette'
const ACTION = 'she sits frozen on the edge of the bed, staring at the mirror'

function bible(perspective: 'first_person' | 'third_person' | 'voiceover', narratorEntityId: string | null): StoryBible {
  return StoryBibleSchema.parse({
    entities: [
      { id: 'ashley', kind: 'character', description: 'a young woman, long black hair, plain white shirt' },
      { id: 'cracked-mirror', kind: 'object', description: 'an old mirror, dark stained wood frame, cracked glass' },
      { id: 'bedroom', kind: 'location', description: 'a small bedroom, cream walls, a bare bulb' },
    ],
    continuity: { narratorPerspective: perspective, narratorEntityId, timeline: [] },
  })
}

describe('assembleImagePrompt — legacy (no expansion)', () => {
  it('is unchanged: style, then content', () => {
    expect(assembleImagePrompt(ACTION, STYLE)).toBe(`${STYLE}, ${ACTION}`)
  })
})

describe('assembleImagePrompt — bible expansion', () => {
  it('splices style, then frozen specs (primary first), then action', () => {
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: bible('third_person', null),
      primaryEntity: 'cracked-mirror',
      supportingEntities: ['ashley', 'bedroom'],
    })
    expect(out).toBe(
      `${STYLE}. an old mirror, dark stained wood frame, cracked glass. a young woman, long black hair, plain white shirt. a small bedroom, cream walls, a bare bulb. ${ACTION}`,
    )
  })

  it('now splices the narrator in a first-person reel too (she must render consistently when shown)', () => {
    // Previously suppressed; that left the narrator unanchored → she rendered as a random/wrong figure when
    // her reflection or body was in frame. She's now spliced like any entity; POV framing (not hiding her
    // identity) keeps her from being a separate full figure.
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: bible('first_person', 'ashley'),
      primaryEntity: 'ashley',
      supportingEntities: ['cracked-mirror'],
    })
    expect(out).toContain('a young woman, long black hair')
    expect(out).toContain('an old mirror, dark stained wood frame, cracked glass')
  })

  it('does NOT suppress the narrator in a third-person reel', () => {
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: bible('third_person', 'ashley'),
      primaryEntity: 'ashley',
      supportingEntities: [],
    })
    expect(out).toContain('a young woman, long black hair, plain white shirt')
  })

  it('splices entities normally under a voiceover bible (no narrator entity exists to suppress)', () => {
    // Voiceover = non-diegetic narrator: narratorEntityId is always null, so expansion behaves exactly
    // like third_person — subject entities splice, nothing narrator-related fires.
    const out = assembleImagePrompt('aerial view of the site at dusk', STYLE, {
      bible: bible('voiceover', null),
      primaryEntity: 'bedroom',
      supportingEntities: ['cracked-mirror'],
    })
    expect(out).toContain('a small bedroom, cream walls, a bare bulb')
    expect(out).toContain('an old mirror, dark stained wood frame, cracked glass')
  })

  it('drops unresolved references but still renders style + action', () => {
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: bible('third_person', null),
      primaryEntity: 'staircase',
      supportingEntities: [],
    })
    expect(out).toBe(`${STYLE}. ${ACTION}`)
  })

  it('an empty bible degrades to style + action (fail-soft)', () => {
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: EMPTY_STORY_BIBLE,
      primaryEntity: 'anything',
      supportingEntities: ['whatever'],
    })
    expect(out).toBe(`${STYLE}. ${ACTION}`)
  })

  it('splices only the scene-selected time-bound appearance', () => {
    const retell = StoryBibleSchema.parse({
      entities: [{
        id: 'grandmother',
        kind: 'character',
        description: 'an elderly woman with silver hair in a low bun',
        appearances: [{ id: 'remembered-youth', description: 'a young girl with long black hair and a red ribbon' }],
      }],
    })
    const out = assembleImagePrompt('she runs along the riverbank', STYLE, {
      bible: retell,
      primaryEntity: 'grandmother',
      supportingEntities: [],
      appearanceByEntity: { grandmother: 'remembered-youth' },
    })
    expect(out).toContain('a young girl with long black hair and a red ribbon')
    expect(out).not.toContain('an elderly woman')
  })

  it('splices the resolved exact identity ahead of analyzer shorthand', () => {
    const factual = StoryBibleSchema.parse({
      entities: [{
        id: 'thermonuclear-weapon',
        kind: 'object',
        description: 'a compact cylindrical weapon beneath a deployed parachute',
        depiction: {
          subjectClass: 'object',
          depictionMode: 'reference_plate',
          eligibilityReason: 'real_subject',
          query: 'Mark 39 nuclear bomb',
        },
      }],
    })
    const out = assembleImagePrompt('descending through pale sky', STYLE, {
      bible: factual,
      primaryEntity: 'thermonuclear-weapon',
      supportingEntities: [],
    })
    expect(out).toContain('exact real-world identity: Mark 39 nuclear bomb')
    expect(out).toContain('preserve its identity-defining visible form and features from the conditioning reference')
    expect(out).toContain('a compact cylindrical weapon beneath a deployed parachute')
  })
})

describe('castNationality', () => {
  it('maps a channel language to a nationality', () => {
    expect(castNationality(['tagalog'])).toBe('Filipino')
    expect(castNationality(['taglish'])).toBe('Filipino')
    expect(castNationality(['korean'])).toBe('Korean')
  })
  it('falls back to region when the language is ambiguous', () => {
    expect(castNationality(['english'], 'rural Philippines')).toBe('Filipino')
    expect(castNationality(['spanish'], 'a coastal town in Japan')).toBe('Japanese')
  })
  it('returns empty when neither language nor region is confident (no wrong guess)', () => {
    expect(castNationality(['english'], 'a nameless city')).toBe('')
    expect(castNationality([])).toBe('')
    expect(castNationality(null)).toBe('')
  })
})

describe('assembleImagePrompt — cast directive', () => {
  it('injects the cast clause after style, defensively (does not force a person)', () => {
    const out = assembleImagePrompt(ACTION, STYLE, undefined, undefined, 'Filipino')
    expect(out).toBe(`${STYLE}, ${ACTION}. any people in frame are Filipino`)
  })
  it('places the cast clause between style and the entity specs', () => {
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: bible('third_person', null),
      primaryEntity: 'ashley',
      supportingEntities: [],
    }, undefined, 'Filipino')
    expect(out).toBe(`${STYLE}. any people in frame are Filipino. a young woman, long black hair, plain white shirt. ${ACTION}`)
  })
  it('omits the clause when cast is empty (unchanged behavior)', () => {
    expect(assembleImagePrompt(ACTION, STYLE, undefined, undefined, '')).toBe(`${STYLE}, ${ACTION}`)
  })
})

describe('historicalEraDirective', () => {
  it('carries a historical era and region into independent image calls', () => {
    expect(historicalEraDirective('1917', 'New York City')).toContain('historically accurate to 1917 in New York City')
    expect(historicalEraDirective('1917', 'New York City')).toContain('artworks, and display conventions are period-authentic')
    expect(historicalEraDirective('1917', 'New York City')).toContain('no later-era features')
  })

  it('does not force a historical treatment onto modern or unspecified stories', () => {
    expect(historicalEraDirective('modern-day', 'Manila')).toBeUndefined()
    expect(historicalEraDirective('unknown')).toBeUndefined()
    expect(historicalEraDirective('')).toBeUndefined()
  })
})
