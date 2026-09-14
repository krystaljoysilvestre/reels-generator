import type * as EvidencePrompt from '@reels/core/prompts/evidence-acquire.v1'
import type * as TopicsPrompt from '@reels/core/prompts/series-topics.v1'
import type * as DbModule from '@reels/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcePolicySchema } from '@reels/core'

const mocks = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn(), values: vi.fn(), llmCall: vi.fn(), spend: vi.fn(), spendFromError: vi.fn(), evidencePrompt: vi.fn(), topicsPrompt: vi.fn() }))
vi.mock('@reels/db', async (original) => ({
  ...await original<typeof DbModule>(),
  getDb: () => ({ select: mocks.select, insert: mocks.insert }),
  recordSpendEvent: mocks.spend,
}))
vi.mock('@reels/providers', () => ({ llmCall: mocks.llmCall, spendFromError: mocks.spendFromError }))
vi.mock('@reels/core/prompts/evidence-acquire.v1', async (original) => ({
  ...await original<typeof EvidencePrompt>(),
  buildEvidenceAcquirePrompt: mocks.evidencePrompt,
}))
vi.mock('@reels/core/prompts/series-topics.v1', async (original) => ({
  ...await original<typeof TopicsPrompt>(),
  buildSeriesTopicsPrompt: mocks.topicsPrompt,
}))

import { acquireEvidence, pickNextSeriesTopic, replenishSeriesTopics } from './series-queue.js'

const fiction = SourcePolicySchema.parse({})
const factual = SourcePolicySchema.parse({ realEvents: true, realPeople: 'historical', evidenceRequired: true, invention: 'none' })
const channel = { id: 'channel', name: 'Stories', nicheDescription: 'A collection', userId: 'owner', storyMode: 'standard', genreCategory: 'cozy mystery', sourcePolicy: fiction }

// Fluent read builder backed by fixed rows; no database or provider calls run in these tests.
function rowsQuery(rows: unknown[]) {
  const result = Promise.resolve(rows)
  return Object.assign(result, {
    from: () => rowsQuery(rows), where: () => rowsQuery(rows), orderBy: () => rowsQuery(rows),
    groupBy: () => rowsQuery(rows), limit: () => rowsQuery(rows),
  })
}

describe('series source policy reaches subject planning and acquisition', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.spendFromError.mockReturnValue(0)
    mocks.select.mockReturnValue(rowsQuery([]))
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.evidencePrompt.mockReturnValue({ system: 'Evidence', userMessage: 'Subject' })
    mocks.topicsPrompt.mockReturnValue({ system: 'Topics', userMessage: 'Series' })
  })

  it('carries the selected series policy beside its exact custom genre', async () => {
    mocks.select
      .mockReturnValueOnce(rowsQuery([{ id: 'series', name: 'History', genreCategory: 'science history', sourcePolicy: factual, narrativeStyle: null, orderIdx: 0 }]))
      .mockReturnValueOnce(rowsQuery([]))
      .mockReturnValueOnce(rowsQuery([{ id: 'topic', subject: 'The discovery' }]))
    expect(await pickNextSeriesTopic('channel')).toMatchObject({ sourcePolicy: factual, genreCategory: 'science history' })
  })

  it('uses the series real-subject requirement and discards invented topic candidates', async () => {
    mocks.llmCall.mockResolvedValue({ data: { topics: [{ subject: 'Real subject', real: true }, { subject: 'Invented case', real: false }] }, costCents: 2 })
    expect(await replenishSeriesTopics(channel, { id: 'series', name: 'History', sourcePolicy: factual })).toBe(1)
    expect(mocks.topicsPrompt).toHaveBeenCalledWith(expect.objectContaining({ requireReal: true }))
    expect(mocks.values).toHaveBeenCalledWith([expect.objectContaining({ subject: 'Real subject' })])
    expect(mocks.spend).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'channel', userId: 'owner', costCents: 2 }))
  })

  it('uses the resolved series people permission during evidence acquisition', async () => {
    mocks.llmCall.mockResolvedValue({ data: { sufficient: true, dossier: 'The record describes the finding.', sources: [{ title: 'Record', url: 'https://example.com/record' }] }, costCents: 4 })
    expect(await acquireEvidence(channel, 'A documented finding', factual)).not.toBeNull()
    expect(mocks.evidencePrompt).toHaveBeenCalledWith(expect.objectContaining({ allowPeople: true }))
    expect(mocks.spend).toHaveBeenCalledWith(expect.objectContaining({ channelId: 'channel', userId: 'owner', costCents: 4 }))
  })

  it.each([
    ['Japanese', '月の観測', '森の観察'],
    ['Arabic', 'قصة القمر', 'قصة البحر'],
    ['Devanagari vowel marks', 'कल', 'काल'],
    ['Devanagari numbers', 'अध्याय १', 'अध्याय २'],
  ])('keeps distinct %s subjects instead of collapsing them to one empty key', async (_script, existing, proposed) => {
    mocks.select.mockReturnValue(rowsQuery([{ subject: existing }]))
    mocks.llmCall.mockResolvedValue({ data: { topics: [{ subject: proposed, real: true }] }, costCents: 2 })
    expect(await replenishSeriesTopics(channel, { id: 'series', name: 'Stories' })).toBe(1)
    expect(mocks.values).toHaveBeenCalledWith([expect.objectContaining({ subject: proposed })])
  })

  it.each([
    ['ガラスの街', '「カ\u3099ラスの街」'],
    ['قصة القمر', '  «قصة   القمر»  '],
  ])('rejects a normalized duplicate of %s without rewriting its Unicode text', async (existing, proposed) => {
    mocks.select.mockReturnValue(rowsQuery([{ subject: existing }]))
    mocks.llmCall.mockResolvedValue({ data: { topics: [{ subject: proposed, real: true }] }, costCents: 2 })
    expect(await replenishSeriesTopics(channel, { id: 'series', name: 'Stories' })).toBe(0)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('deduplicates Unicode equivalents within a batch while preserving distinct subjects', async () => {
    mocks.llmCall.mockResolvedValue({
      data: { topics: ['ガラスの街', '「カ\u3099ラスの街」', '月の観測'].map((subject) => ({ subject, real: true })) },
      costCents: 2,
    })
    expect(await replenishSeriesTopics(channel, { id: 'series', name: 'Stories' })).toBe(2)
    expect(mocks.values).toHaveBeenCalledWith([
      expect.objectContaining({ subject: 'ガラスの街' }),
      expect.objectContaining({ subject: '月の観測' }),
    ])
  })

  it('records failed paid topic generation once before returning an empty queue', async () => {
    const failure = new Error('Schema repair failed')
    mocks.llmCall.mockRejectedValue(failure)
    mocks.spendFromError.mockReturnValue(5)
    expect(await replenishSeriesTopics(channel, { id: 'series', name: 'History', sourcePolicy: factual })).toBe(0)
    expect(mocks.spendFromError).toHaveBeenCalledWith(failure)
    expect(mocks.spend).toHaveBeenCalledTimes(1)
    expect(mocks.spend).toHaveBeenCalledWith(expect.objectContaining({ userId: 'owner', channelId: 'channel', surface: 'series_replenish', costCents: 5 }))
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
