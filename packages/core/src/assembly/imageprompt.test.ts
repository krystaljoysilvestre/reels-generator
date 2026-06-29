import { describe, it, expect } from 'vitest'
import { assembleImagePrompt } from './imageprompt.js'
import { StoryBibleSchema, EMPTY_STORY_BIBLE, type StoryBible } from '../types/story-bible.js'

const STYLE = 'grainy 16mm horror still, desaturated palette'
const ACTION = 'she sits frozen on the edge of the bed, staring at the mirror'

function bible(perspective: 'first_person' | 'third_person', narratorEntityId: string | null): StoryBible {
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

  it('suppresses the narrator full-figure splice in a first-person reel', () => {
    const out = assembleImagePrompt(ACTION, STYLE, {
      bible: bible('first_person', 'ashley'),
      primaryEntity: 'ashley',
      supportingEntities: ['cracked-mirror'],
    })
    expect(out).not.toContain('a young woman, long black hair')
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
})
