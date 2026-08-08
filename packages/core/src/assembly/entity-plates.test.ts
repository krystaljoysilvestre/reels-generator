import { describe, it, expect } from 'vitest'
import { normalizeCanon } from './story-bible.js'
import { EntityPlateStoreSchema, entityDescriptionHash } from '../types/story-bible.js'

describe('normalizeCanon — unified recurring entities', () => {
  it('emits a CHARACTER, which the two-array shape structurally could not', () => {
    const out = normalizeCanon({ persistentEntities: [{ name: 'Aswang', kind: 'character', description: 'a gaunt winged figure with matted black hair' }] })
    expect(out).toHaveLength(1)
    expect(out[0]!.kind).toBe('character')
    expect(out[0]!.id).toBe('aswang')
    expect(out[0]!.description).toContain('gaunt winged')
  })

  it('still resolves the legacy name-only arrays, description === name', () => {
    const out = normalizeCanon({ canonLocations: ['the old house'], canonObjects: ['a brass pole'] })
    expect(out.map((e) => [e.kind, e.id])).toEqual([['location', 'the-old-house'], ['object', 'a-brass-pole']])
    expect(out[0]!.description).toBe('the old house')
  })

  it('prefers the richer v2 entry when both shapes name the same thing', () => {
    const out = normalizeCanon({
      canonLocations: ['Balete Drive'],
      persistentEntities: [{ name: 'Balete Drive', kind: 'location', description: 'a two-lane road under old balete trees, streetlights failing' }],
    })
    expect(out).toHaveLength(1) // not duplicated
    expect(out[0]!.description).toContain('two-lane road') // the depictable one wins over the bare name
  })

  it('is empty for an anthology — no padding to a quota', () => {
    expect(normalizeCanon({})).toEqual([])
  })
})

describe('entity plate reuse', () => {
  it('reuses only while the description is unchanged', () => {
    const desc = 'a tidy anthropomorphic fox in a charcoal blazer'
    const store = EntityPlateStoreSchema.parse({ 'ledger-fox': { key: 'r2/plate.webp', descriptionHash: entityDescriptionHash(desc) } })
    expect(store['ledger-fox']!.descriptionHash).toBe(entityDescriptionHash(desc))
    // Editing the entity must re-mint rather than silently serve the old look.
    expect(store['ledger-fox']!.descriptionHash).not.toBe(entityDescriptionHash(`${desc} and round glasses`))
  })

  it('ignores whitespace-only edits so a trivial change is not a costly re-mint', () => {
    expect(entityDescriptionHash('a  gaunt   winged figure ')).toBe(entityDescriptionHash('a gaunt winged figure'))
  })
})
