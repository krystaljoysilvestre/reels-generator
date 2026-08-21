import { describe, it, expect } from 'vitest'
import {
  HUMAN_PLATE_MIN_YEARS_DEAD,
  SAFE_REPRESENTATIVE_STAGING,
  computeMediaDisclosure,
  depictionModeForHuman,
  isHistoricallyEligible,
  mentionsAny,
  personNameVariants,
  scrubNames,
  allowsRealWorldEntityPlates,
  canUseArchivalHumanShot,
  canUseHistoricalHumanPlate,
  isPresentedArchival,
} from './depiction.js'
import { SourcePolicySchema } from './source-policy.js'

// The safety spine of specs/depictive-fidelity.md. These are not style tests — each one stands for a way a
// real person could be depicted as someone they are not, or real media misrepresented as synthetic.

const YEAR = 2026

describe('invariant 4 — identity and eligibility are verified separately, and fail differently', () => {
  it('grants a conditioning plate only to a verified, long-dead identity', () => {
    expect(depictionModeForHuman({ wikibaseItem: 'Q34597', deathYear: 1896, currentYear: YEAR })).toEqual({
      depictionMode: 'reference_plate',
      eligibilityReason: 'verified_historical',
    })
  })

  it('routes a verified but recently-deceased person to archival-only, never a plate', () => {
    const r = depictionModeForHuman({ wikibaseItem: 'Q123', deathYear: YEAR - 50, currentYear: YEAR })
    expect(r.depictionMode).toBe('archival_only')
    expect(r.eligibilityReason).toBe('living_or_recently_deceased')
  })

  it('routes a verified identity with NO death date to archival-only — absent is ineligible, not unknown', () => {
    const r = depictionModeForHuman({ wikibaseItem: 'Q123', deathYear: null, currentYear: YEAR })
    expect(r.depictionMode).toBe('archival_only')
    expect(r.eligibilityReason).toBe('death_date_unverifiable')
  })

  it('routes an UNVERIFIED identity to identity_withheld — neither sourced NOR invented', () => {
    // Two wrong answers this avoids. 'generated' would mint an ordinary plate, i.e. INVENT a face for a
    // named real person and splice it into every scene (observed live: Duchamp got an invented look).
    // 'archival_only' is the STRONGER claim ("may be presented from a real photograph") and must not be
    // reachable by a name we could not resolve. Unverified identity gets neither.
    for (const deathYear of [null, 1800, YEAR - 1]) {
      const r = depictionModeForHuman({ wikibaseItem: null, deathYear, currentYear: YEAR })
      expect(r.depictionMode).toBe('identity_withheld')
      expect(r.eligibilityReason).toBe('identity_unverified')
    }
  })

  it('compares calendar years and treats malformed values as ineligible', () => {
    expect(isHistoricallyEligible(YEAR - HUMAN_PLATE_MIN_YEARS_DEAD, YEAR)).toBe(true) // exactly on the boundary
    expect(isHistoricallyEligible(YEAR - HUMAN_PLATE_MIN_YEARS_DEAD + 1, YEAR)).toBe(false) // one year short
    expect(isHistoricallyEligible(-44, YEAR)).toBe(true) // BCE
    expect(isHistoricallyEligible(null, YEAR)).toBe(false)
    expect(isHistoricallyEligible(undefined, YEAR)).toBe(false)
    expect(isHistoricallyEligible(Number.NaN, YEAR)).toBe(false)
  })
})

describe('invariant 2 — an archival_only person never reaches a generated prompt as text', () => {
  const names = personNameVariants('juan-dela-cruz')

  it('derives full name and surname forms', () => {
    expect(names).toContain('Juan Dela Cruz')
    expect(names).toContain('Cruz')
    expect(names).toContain('Juan')
  })

  it('detects the name anywhere in a prompt, including possessives and mixed case', () => {
    expect(mentionsAny('Close-up of JUAN DELA CRUZ at a podium', names)).toBe(true)
    expect(mentionsAny("Cruz's hands on the document", names)).toBe(true)
    expect(mentionsAny('a wide shot of the empty hall', names)).toBe(false)
  })

  it('does not fire on a name embedded inside a longer word', () => {
    expect(mentionsAny('a crucible on the workbench', personNameVariants('cruz'))).toBe(false)
  })

  it('removes every form and leaves a well-formed prompt', () => {
    const scrubbed = scrubNames('Close-up of Juan Dela Cruz, shaking hands with Cruz, flags behind', names)
    expect(mentionsAny(scrubbed, names)).toBe(false)
    expect(scrubbed).not.toMatch(/\s{2,}/)
    expect(scrubbed).not.toMatch(/^[\s,;:]/)
    expect(scrubbed).toContain('shaking hands')
  })

  it('offers a fallback that names nobody and describes presence rather than absence', () => {
    expect(mentionsAny(SAFE_REPRESENTATIVE_STAGING, names)).toBe(false)
    // "no faces" / "without" style negation is the failure mode this constant exists to avoid.
    expect(SAFE_REPRESENTATIVE_STAGING).not.toMatch(/\bno faces\b|\bwithout\b|\bunidentifiable\b/i)
  })
})

describe('permission helpers', () => {
  const openPolicy = SourcePolicySchema.parse({ realPlaces: true, realPeople: 'historical' })
  const closedPolicy = SourcePolicySchema.parse({})

  it('reads real-world plate permission off the historically-named field', () => {
    expect(allowsRealWorldEntityPlates(openPolicy)).toBe(true)
    expect(allowsRealWorldEntityPlates(closedPolicy)).toBe(false)
  })

  it('requires narrative permission AND the structural mode for either human path', () => {
    expect(canUseHistoricalHumanPlate(openPolicy, { depictionMode: 'reference_plate' })).toBe(true)
    expect(canUseHistoricalHumanPlate(openPolicy, { depictionMode: 'archival_only' })).toBe(false)
    expect(canUseHistoricalHumanPlate(closedPolicy, { depictionMode: 'reference_plate' })).toBe(false)

    expect(canUseArchivalHumanShot(openPolicy, { depictionMode: 'archival_only' })).toBe(true)
    expect(canUseArchivalHumanShot(openPolicy, { depictionMode: 'reference_plate' })).toBe(false)
    expect(canUseArchivalHumanShot(closedPolicy, { depictionMode: 'archival_only' })).toBe(false)
  })
})

describe('invariant 3 — provenance distinguishes conditioning input from presented media', () => {
  it('identifies presented archival media, and nothing else', () => {
    expect(isPresentedArchival({ type: 'sourced', usage: 'presented_archival' })).toBe(true)
    expect(isPresentedArchival({ type: 'sourced', usage: 'conditioning_reference' })).toBe(false)
    expect(isPresentedArchival({ type: 'generated' })).toBe(false)
    expect(isPresentedArchival(null)).toBe(false)
    // A pre-existing sourced plate written before `usage` existed is a conditioning reference, not
    // presented media — it must not become un-modifiable retroactively, nor claim to be a real shot.
    expect(isPresentedArchival({ type: 'sourced', provider: 'wikimedia' })).toBe(false)
  })
})

describe('media disclosure is computed from what the reel contains', () => {
  it('names both media when a reel mixes them', () => {
    expect(computeMediaDisclosure({ hasGeneratedScenes: true, hasArchivalScenes: true, isEvidenceBacked: true }))
      .toBe('Illustration + archival photographs · based on documented sources')
  })

  it('does not call a fully archival reel an illustration', () => {
    const label = computeMediaDisclosure({ hasGeneratedScenes: false, hasArchivalScenes: true, isEvidenceBacked: true })
    expect(label).toBe('Archival photographs · based on documented sources')
    expect(label).not.toMatch(/illustrat/i)
  })

  it('keeps the original label for a fully generated evidence-backed reel', () => {
    expect(computeMediaDisclosure({ hasGeneratedScenes: true, hasArchivalScenes: false, isEvidenceBacked: true }))
      .toBe('Illustrated · based on documented sources')
  })

  it('stays silent for reels that are not evidence-backed (unchanged product behaviour)', () => {
    expect(computeMediaDisclosure({ hasGeneratedScenes: true, hasArchivalScenes: true, isEvidenceBacked: false })).toBe('')
  })
})
