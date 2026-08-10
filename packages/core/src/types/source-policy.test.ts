import { describe, it, expect } from 'vitest'
import {
  SourcePolicySchema,
  DEFAULT_SOURCE_POLICY,
  legacySourcePolicy,
  resolveChannelPolicy,
  requiresRealSubjects,
  requiresEvidence,
  SOURCE_POLICY_CHOICES,
  mustAskSourcePolicy,
} from './source-policy.js'

describe('SourcePolicySchema — the contradictory state is unrepresentable', () => {
  it("forces evidenceRequired when invention is 'none'", () => {
    // A UI guard would only hold in the screen that implements it. Normalizing here means no route, no
    // derivation and no hand-written jsonb can produce the pair.
    expect(SourcePolicySchema.parse({ invention: 'none' }).evidenceRequired).toBe(true)
    expect(SourcePolicySchema.parse({ invention: 'none', evidenceRequired: false }).evidenceRequired).toBe(true)
  })

  it('leaves the other inventions alone', () => {
    expect(SourcePolicySchema.parse({ invention: 'free' }).evidenceRequired).toBe(false)
    expect(SourcePolicySchema.parse({ invention: 'constrained' }).evidenceRequired).toBe(false)
  })

  it('defaults to "invent everything, name nobody" — today\'s behaviour for every existing channel', () => {
    expect(DEFAULT_SOURCE_POLICY).toEqual({
      realPlaces: false,
      realEvents: false,
      realPeople: 'none',
      evidenceRequired: false,
      invention: 'free',
    })
  })
})

describe('requiresEvidence — may a factual script be written at all?', () => {
  it('is true for an explicit evidence requirement', () => {
    expect(requiresEvidence(SourcePolicySchema.parse({ evidenceRequired: true }))).toBe(true)
  })

  it("is true for invention: 'none' (nothing may be invented ⇒ claims must come from somewhere)", () => {
    expect(requiresEvidence(SourcePolicySchema.parse({ invention: 'none' }))).toBe(true)
  })

  it('is false for pure fiction — a folklore or horror channel must not be forced to source', () => {
    expect(requiresEvidence(DEFAULT_SOURCE_POLICY)).toBe(false)
    expect(requiresEvidence(SourcePolicySchema.parse({ realPlaces: true, invention: 'constrained' }))).toBe(false)
  })
})

describe('requiresRealSubjects — may topic generation invent a subject?', () => {
  it('is true wherever anything is treated as real', () => {
    expect(requiresRealSubjects(SourcePolicySchema.parse({ realPlaces: true }))).toBe(true)
    expect(requiresRealSubjects(SourcePolicySchema.parse({ invention: 'constrained' }))).toBe(true)
  })

  it('is false only for pure fiction', () => {
    expect(requiresRealSubjects(DEFAULT_SOURCE_POLICY)).toBe(false)
  })
})

describe('legacySourcePolicy — an existing channel behaves exactly as it does today', () => {
  it('grants NO permissions by inference, even for an informational channel', () => {
    const p = legacySourcePolicy({ genreCategory: 'informational', storyMode: 'standard', factCheck: false })
    // "Probably factual" is not a licence to start naming real places in output that fictionalized them.
    expect(p.realPlaces).toBe(false)
    expect(p.realPeople).toBe('none')
    expect(p.invention).toBe('free')
  })

  it('turns on CHECKING (not permissions) for an EBN channel', () => {
    const p = legacySourcePolicy({ storyMode: 'ebn' })
    expect(p.evidenceRequired).toBe(true)
    expect(p.invention).toBe('none')
    expect(p.realPeople).toBe('none') // still not a permission
  })

  it('respects an existing factCheck opt-in', () => {
    expect(legacySourcePolicy({ factCheck: true }).evidenceRequired).toBe(true)
  })
})

describe('resolveChannelPolicy — the frozen reel policy wins outright', () => {
  const channel = { sourcePolicy: SourcePolicySchema.parse({ realPlaces: true, realEvents: true }) }

  it('prefers the reel over the channel, so editing a channel cannot rewrite history', () => {
    const reel = { sourcePolicy: SourcePolicySchema.parse({ invention: 'free' }) }
    expect(resolveChannelPolicy(reel, null, channel).realPlaces).toBe(false) // the reel's, not the channel's
  })

  it('prefers a series override over the channel when the reel has none', () => {
    const series = { sourcePolicy: SourcePolicySchema.parse({ realPeople: 'public_figures' }) }
    expect(resolveChannelPolicy(null, series, channel).realPeople).toBe('public_figures')
  })

  it('falls back to the channel, then to legacy inference', () => {
    expect(resolveChannelPolicy(null, null, channel).realPlaces).toBe(true)
    expect(resolveChannelPolicy(null, null, { storyMode: 'ebn' }).invention).toBe('none')
  })

  it('ignores a malformed stored policy rather than throwing', () => {
    // A hand-edited jsonb must degrade to the safe inference, never crash the pipeline.
    expect(resolveChannelPolicy({ sourcePolicy: { nonsense: true } }, null, {}).invention).toBe('free')
  })
})

describe('the wizard question is code-guaranteed, not prompt-dependent', () => {
  it('asks whenever the derivation omitted a policy', () => {
    expect(mustAskSourcePolicy({})).toBe(true)
    expect(mustAskSourcePolicy({ sourcePolicy: DEFAULT_SOURCE_POLICY })).toBe(false)
  })

  it('offers the safest option first, so skipping means accepting a visible choice', () => {
    expect(SOURCE_POLICY_CHOICES.length).toBeGreaterThanOrEqual(2)
    expect(requiresEvidence(SOURCE_POLICY_CHOICES[0]!.value)).toBe(false)
    expect(SOURCE_POLICY_CHOICES[0]!.value).toEqual(DEFAULT_SOURCE_POLICY)
  })

  it('every choice is internally consistent (the schema normalizes them)', () => {
    for (const c of SOURCE_POLICY_CHOICES) {
      expect(SourcePolicySchema.parse(c.value)).toEqual(c.value)
      if (c.value.invention === 'none') expect(c.value.evidenceRequired).toBe(true)
    }
  })
})
