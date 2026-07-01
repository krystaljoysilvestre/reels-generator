import { describe, it, expect } from 'vitest'
import { slug, normalizeCanon, resolveEntityRef, resolveEntities, mergeBible } from './story-bible.js'
import { StoryBibleSchema, type StoryBible } from '../types/story-bible.js'

function bible(over: Partial<StoryBible> = {}): StoryBible {
  return StoryBibleSchema.parse({
    entities: [
      { id: 'cracked-mirror', kind: 'object', description: 'an old mirror, dark stained wood frame, cracked glass' },
      { id: 'bedroom', kind: 'location', description: 'a small bedroom, cream walls, one shuttered window, a bare bulb' },
      { id: 'ashley', kind: 'character', description: 'a young woman, long black hair, plain white shirt' },
    ],
    continuity: { narratorPerspective: 'third_person', narratorEntityId: null, timeline: [] },
    ...over,
  })
}

describe('slug', () => {
  it('lowercases and kebab-cases punctuation/whitespace', () => {
    expect(slug('The Mirror')).toBe('the-mirror')
    expect(slug('the_mirror')).toBe('the-mirror')
    expect(slug('  Cracked Mirror!  ')).toBe('cracked-mirror')
  })
})

describe('normalizeCanon', () => {
  it('maps name-only canon to entities with kinds and description === name', () => {
    const out = normalizeCanon({ canonLocations: ['Lumang Bahay'], canonObjects: ['Gasera'] })
    expect(out).toEqual([
      { id: 'lumang-bahay', kind: 'location', description: 'Lumang Bahay' },
      { id: 'gasera', kind: 'object', description: 'Gasera' },
    ])
  })
})

describe('mergeBible', () => {
  const canon = normalizeCanon({ canonLocations: ['Lumang Bahay'], canonObjects: ['Gasera', 'Salamin'] })

  it('DROPS canon entities the story never features (no dead settings in the reel bible)', () => {
    const analyzed = StoryBibleSchema.parse({ entities: [{ id: 'rooftop', kind: 'location', description: 'a flat concrete rooftop' }] })
    const out = mergeBible(canon, analyzed)
    // Only the story's own entity survives — unused channel canon (lumang-bahay, gasera, salamin) is not appended.
    expect(out.entities.map((e) => e.id).sort()).toEqual(['rooftop'])
  })

  it('lets the analyzer WIN (extend) a shared canon id, without duplicating it', () => {
    const analyzed = StoryBibleSchema.parse({
      entities: [{ id: 'salamin', kind: 'object', description: 'an old mirror, dark stained wood frame, cracked glass' }],
    })
    const out = mergeBible(canon, analyzed)
    const salamin = out.entities.find((e) => e.id === 'salamin')
    expect(salamin?.description).toBe('an old mirror, dark stained wood frame, cracked glass')
    expect(out.entities).toHaveLength(1) // only the featured entity; other canon (lumang-bahay, gasera) dropped
  })

  it('falls back to the full canon when analysis produced nothing', () => {
    const out = mergeBible(canon, StoryBibleSchema.parse({ entities: [] }))
    expect(out.entities.map((e) => e.id).sort()).toEqual(['gasera', 'lumang-bahay', 'salamin'])
  })

  it('carries continuity + constraints from the analyzer', () => {
    const analyzed = StoryBibleSchema.parse({
      continuity: { narratorPerspective: 'first_person', narratorEntityId: null, timeline: [] },
      constraints: { directorNotes: ['keep the reflection ambiguous'] },
    })
    const out = mergeBible(canon, analyzed)
    expect(out.continuity.narratorPerspective).toBe('first_person')
    expect(out.constraints.directorNotes).toEqual(['keep the reflection ambiguous'])
  })
})

describe('resolveEntityRef', () => {
  it('resolves an exact id', () => {
    expect(resolveEntityRef(bible(), 'bedroom')?.id).toBe('bedroom')
  })
  it('resolves case/punctuation variants', () => {
    expect(resolveEntityRef(bible(), 'The Bedroom')?.id).toBe('bedroom')
  })
  it('resolves unambiguous containment either direction', () => {
    expect(resolveEntityRef(bible(), 'mirror')?.id).toBe('cracked-mirror')
    expect(resolveEntityRef(bible(), 'old-cracked-mirror')?.id).toBe('cracked-mirror')
  })
  it('returns null when containment is ambiguous (two doors)', () => {
    const b = StoryBibleSchema.parse({
      entities: [
        { id: 'front-door', kind: 'object', description: 'a front door' },
        { id: 'back-door', kind: 'object', description: 'a back door' },
      ],
    })
    expect(resolveEntityRef(b, 'door')).toBeNull()
  })
  it('returns null for an unknown reference', () => {
    expect(resolveEntityRef(bible(), 'staircase')).toBeNull()
  })
})

describe('resolveEntities', () => {
  it('orders primary first, then supporting', () => {
    const r = resolveEntities(bible(), { primaryEntity: 'cracked-mirror', supportingEntities: ['ashley', 'bedroom'] })
    expect(r.resolved.map((e) => e.id)).toEqual(['cracked-mirror', 'ashley', 'bedroom'])
    expect(r.unresolved).toEqual([])
  })
  it('dedupes an entity referenced as both primary and supporting, keeping the primary slot', () => {
    const r = resolveEntities(bible(), { primaryEntity: 'ashley', supportingEntities: ['ashley', 'bedroom'] })
    expect(r.resolved.map((e) => e.id)).toEqual(['ashley', 'bedroom'])
  })
  it('collects unresolved references and keeps the resolved ones', () => {
    const r = resolveEntities(bible(), { primaryEntity: 'staircase', supportingEntities: ['bedroom'] })
    expect(r.resolved.map((e) => e.id)).toEqual(['bedroom'])
    expect(r.unresolved).toEqual(['staircase'])
  })
  it('handles a null primary', () => {
    const r = resolveEntities(bible(), { primaryEntity: null, supportingEntities: ['bedroom'] })
    expect(r.resolved.map((e) => e.id)).toEqual(['bedroom'])
  })
})
