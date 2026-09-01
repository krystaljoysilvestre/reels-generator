import { describe, it, expect } from 'vitest'
import { BibleEntitySchema, StoryBibleSchema, conditionableReferenceKeys, formatImageCredits, identityWithheldEntities, missingRequiredIdentityReferences, splitSceneDepiction, type BibleEntity } from './story-bible.js'
import { archivalShotTarget, presentableSourceEntity, presentedSourceTarget } from '../assembly/story-bible.js'
import type { DepictionMode, MediaOrigin } from './depiction.js'

const entity = (id: string, mode: DepictionMode | null, key?: string): BibleEntity =>
  BibleEntitySchema.parse({
    id,
    kind: 'character',
    description: `a description of ${id}`,
    ...(key ? { referenceImageKey: key } : {}),
    ...(key && mode === 'reference_plate' ? { referenceOrigin: { type: 'sourced', provider: 'wikimedia', usage: 'conditioning_reference' } } : {}),
    ...(mode ? { depiction: { subjectClass: 'human', depictionMode: mode, eligibilityReason: 'real_subject', query: id } } : {}),
  })

describe('invariant 1 — an archival_only entity never contributes a reference plate', () => {
  it('excludes it even when it somehow carries a key', () => {
    // The key should never have been minted; this asserts the reference assembler is the guard regardless.
    const keys = conditionableReferenceKeys([
      entity('titanic', 'reference_plate', 'refs/titanic.webp'),
      entity('a-living-official', 'archival_only', 'refs/leaked.webp'),
    ])
    expect(keys).toEqual(['refs/titanic.webp'])
  })

  it('lets a historical human plate and an object plate BOTH condition the same frame', () => {
    // The cross-class mixed scene: correct independent mechanisms are where invariants leak into each other.
    const keys = conditionableReferenceKeys([
      entity('jose-rizal', 'reference_plate', 'refs/rizal.webp'),
      entity('fort-santiago', 'reference_plate', 'refs/fort.webp'),
    ])
    expect(keys).toEqual(['refs/rizal.webp', 'refs/fort.webp'])
  })

  it('treats an unrouted entity as generated, preserving pre-existing behaviour', () => {
    expect(conditionableReferenceKeys([entity('ashley', null, 'refs/ashley.webp')])).toEqual(['refs/ashley.webp'])
  })

  it('rejects a generated fallback plate for a real identity', () => {
    const generatedFallback = BibleEntitySchema.parse({
      id: 'duchamp-fountain', kind: 'object', description: 'the 1917 readymade',
      referenceImageKey: 'refs/generated-fallback.webp', referenceOrigin: { type: 'generated' },
      depiction: { subjectClass: 'object', depictionMode: 'reference_plate', eligibilityReason: 'real_subject', query: 'Duchamp Fountain' },
    })
    expect(conditionableReferenceKeys([generatedFallback])).toEqual([])
    expect(missingRequiredIdentityReferences([generatedFallback]).map((e) => e.id)).toEqual(['duchamp-fountain'])
  })

  it('requires the exact selected state to carry its own sourced anchor', () => {
    const unsigned = BibleEntitySchema.parse({
      ...entity('duchamp-fountain', 'reference_plate', 'refs/fountain.webp'),
      referenceImageKey: undefined,
      referenceOrigin: undefined,
      description: 'the same porcelain fixture, unsigned and upright',
    })
    expect(missingRequiredIdentityReferences([unsigned]).map((e) => e.id)).toEqual(['duchamp-fountain'])
  })
})

describe('splitSceneDepiction', () => {
  it('separates the three media modes and defaults unrouted entities to generated', () => {
    const split = splitSceneDepiction([
      entity('titanic', 'reference_plate', 'refs/titanic.webp'),
      entity('a-living-official', 'archival_only'),
      entity('ashley', null),
      entity('a-bedroom', 'generated'),
    ])
    expect(split.referenceEntities.map((e) => e.id)).toEqual(['titanic'])
    expect(split.archivalEntities.map((e) => e.id)).toEqual(['a-living-official'])
    expect(split.generatedEntities.map((e) => e.id)).toEqual(['ashley', 'a-bedroom'])
  })
})

describe('image credits cover both plates and presented archival media', () => {
  const bible = StoryBibleSchema.parse({
    entities: [
      {
        id: 'paoay-church',
        kind: 'location',
        description: 'a baroque church',
        referenceImageKey: 'refs/paoay.webp',
        referenceOrigin: {
          type: 'sourced', provider: 'wikimedia', usage: 'conditioning_reference',
          url: 'https://commons.wikimedia.org/wiki/File:Paoay.jpg', license: 'CC BY-SA 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', author: 'A Photographer',
        },
      },
      { id: 'ashley', kind: 'character', description: 'a schoolgirl' }, // generated → no credit
    ],
  })

  const archivalOrigin: MediaOrigin = {
    type: 'sourced', provider: 'wikimedia', usage: 'presented_archival', subjectClass: 'human',
    url: 'https://commons.wikimedia.org/wiki/File:Portrait.jpg', license: 'Public domain', author: 'Unknown',
  }

  it('credits a sourced plate with its licence and deed URL', () => {
    const credits = formatImageCredits(bible)
    expect(credits).toContain('Paoay Church')
    expect(credits).toContain('CC BY-SA 4.0')
    expect(credits).toContain('creativecommons.org')
    expect(credits).not.toContain('Ashley')
  })

  it('credits an archival photograph presented as a scene', () => {
    const credits = formatImageCredits(bible, [archivalOrigin, null])
    expect(credits).toContain('Archival photograph')
    expect(credits).toContain('Public domain')
  })

  it('credits each distinct file once, even across several scenes', () => {
    const credits = formatImageCredits(bible, [archivalOrigin, archivalOrigin, archivalOrigin])
    expect(credits.match(/Archival photograph/g)).toHaveLength(1)
  })

  it('drops malformed jsonb rather than failing a publish', () => {
    expect(() => formatImageCredits(bible, [{ nonsense: true }, 'not an object', undefined])).not.toThrow()
    expect(formatImageCredits(bible, [{ nonsense: true }])).toContain('Paoay Church')
  })

  it('returns empty when nothing was sourced, so callers can append unconditionally', () => {
    expect(formatImageCredits(StoryBibleSchema.parse({}), [])).toBe('')
  })
})

describe('identity_withheld — a real person we cannot verify is neither sourced nor invented', () => {
  const unverified = entity('some-real-person', 'identity_withheld', 'refs/should-not-exist.webp')

  it('contributes no reference plate, exactly like archival_only', () => {
    expect(conditionableReferenceKeys([unverified])).toEqual([])
  })

  it('is withheld from prompts alongside archival subjects', () => {
    const split = splitSceneDepiction([unverified, entity('a-living-official', 'archival_only'), entity('titanic', 'reference_plate', 'refs/t.webp')])
    expect(split.withheldEntities.map((e) => e.id)).toEqual(['some-real-person'])
    expect(identityWithheldEntities(split).map((e) => e.id).sort()).toEqual(['a-living-official', 'some-real-person'])
  })

  it('is NEVER a fulfilment target — there is no real photograph to present', () => {
    const split = splitSceneDepiction([unverified])
    expect(archivalShotTarget(split.archivalEntities, 'some-real-person')).toBeNull()
  })
})

describe('archival fulfilment — presence withholds an identity; it does not make the shot about them', () => {
  const duchamp = entity('marcel-duchamp', 'archival_only')

  it('fulfils with the archival photograph when that person IS the subject', () => {
    expect(archivalShotTarget([duchamp], 'marcel-duchamp')?.id).toBe('marcel-duchamp')
  })

  it('does NOT fulfil when the person is merely present — the real Crossroads regression', () => {
    // Scene 2/3 of reel 38f08fcf: the subject is the urinal, Duchamp is supporting. Returning him here
    // would have replaced a shot of the artwork with a portrait of the artist.
    expect(archivalShotTarget([duchamp], 'porcelain-urinal')).toBeNull()
  })

  it('does not replace an event containing another exact sourced subject with a portrait', () => {
    const fountain = entity('duchamp-fountain', 'reference_plate', 'refs/fountain.webp')
    expect(archivalShotTarget([duchamp], 'marcel-duchamp', [fountain])).toBeNull()
  })

  it('does not fulfil with two archival subjects — compositing real people is forbidden', () => {
    expect(archivalShotTarget([duchamp, entity('someone-else', 'archival_only')], 'marcel-duchamp')).toBeNull()
  })

  it('does not fulfil an untagged scene', () => {
    expect(archivalShotTarget([duchamp], null)).toBeNull()
    expect(archivalShotTarget([], 'marcel-duchamp')).toBeNull()
  })

  it('matches on the normalized id, not raw text', () => {
    expect(archivalShotTarget([duchamp], 'Marcel_Duchamp')?.id).toBe('marcel-duchamp')
  })
})

describe('verified source presentation', () => {
  const exactPage = BibleEntitySchema.parse({
    ...entity('the-blind-man-magazine', 'reference_plate', 'refs/magazine.webp'),
    kind: 'object',
    referenceOrigin: {
      type: 'sourced',
      provider: 'wikimedia',
      usage: 'conditioning_reference',
      sourceAssetKey: 'refs/magazine-source.webp',
    },
  })

  it('presents an explicitly requested sourced primary entity', () => {
    expect(presentedSourceTarget([exactPage], 'the-blind-man-magazine', 'the-blind-man-magazine', {}))
      .toBe(exactPage)
  })

  it('does not turn a supporting mention into the whole shot', () => {
    expect(presentedSourceTarget([exactPage], 'the-blind-man-magazine', 'duchamp-fountain', {})).toBeNull()
  })

  it('does not present a parent source as a selected time-bound state', () => {
    expect(presentedSourceTarget(
      [exactPage],
      'the-blind-man-magazine',
      'the-blind-man-magazine',
      { 'the-blind-man-magazine': 'draft-before-publication' },
    )).toBeNull()
  })

  it('requires untouched source bytes, not merely a conditioning plate', () => {
    const withoutSourceBytes = BibleEntitySchema.parse({
      ...exactPage,
      referenceOrigin: { type: 'sourced', provider: 'wikimedia', usage: 'conditioning_reference' },
    })
    expect(presentedSourceTarget(
      [withoutSourceBytes],
      'the-blind-man-magazine',
      'the-blind-man-magazine',
      {},
    )).toBeNull()
  })

  it('promotes an appearance source only when that state exactly matches the canonical entity', () => {
    const fountain = BibleEntitySchema.parse({
      ...entity('duchamp-fountain', 'reference_plate'),
      kind: 'object',
      description: "a porcelain urinal turned on its back, marked 'R. Mutt 1917'",
      appearances: [
        {
          id: 'precursor',
          description: 'an upright unmarked porcelain urinal',
          referenceOrigin: { type: 'sourced', provider: 'wikimedia', usage: 'conditioning_reference', sourceAssetKey: 'refs/fountain-source.webp' },
        },
        {
          id: 'transformed',
          description: "a porcelain urinal turned on its back, marked 'R. Mutt 1917'",
          referenceOrigin: { type: 'sourced', provider: 'wikimedia', usage: 'conditioning_reference', sourceAssetKey: 'refs/fountain-source.webp' },
        },
      ],
    })
    expect(presentableSourceEntity(fountain)?.referenceOrigin?.sourceAssetKey).toBe('refs/fountain-source.webp')
    expect(presentedSourceTarget([fountain], 'duchamp-fountain', 'duchamp-fountain', {})?.referenceOrigin?.sourceAssetKey)
      .toBe('refs/fountain-source.webp')
    expect(presentedSourceTarget([fountain], 'duchamp-fountain', 'duchamp-fountain', { 'duchamp-fountain': 'precursor' }))
      .toBeNull()
  })
})
