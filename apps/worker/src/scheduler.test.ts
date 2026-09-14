import type * as DbModule from '@reels/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcePolicySchema } from '@reels/core'

const mocks = vi.hoisted(() => ({
  channels: vi.fn(), select: vi.fn(), insert: vi.fn(), update: vi.fn(), values: vi.fn(), set: vi.fn(),
  enqueueStep: vi.fn(), pick: vi.fn(), claim: vi.fn(), skip: vi.fn(), acquire: vi.fn(),
}))
vi.mock('@reels/db', async (original) => ({
  ...await original<typeof DbModule>(),
  getDb: () => ({ query: { channels: { findMany: mocks.channels } }, select: mocks.select, insert: mocks.insert, update: mocks.update }),
}))
vi.mock('@reels/queue', () => ({ enqueueStep: mocks.enqueueStep, makeQueue: vi.fn(), QUEUE: { SCHEDULER: 'scheduler' } }))
vi.mock('./series-queue.js', () => ({
  pickNextSeriesTopic: mocks.pick, claimSeriesTopic: mocks.claim, skipSeriesTopic: mocks.skip, acquireEvidence: mocks.acquire,
}))

import { runAutoProduceTick } from './scheduler.js'

const fiction = SourcePolicySchema.parse({})
const factual = SourcePolicySchema.parse({ realEvents: true, realPeople: 'historical', evidenceRequired: true, invention: 'none' })
const channel = {
  id: 'channel', userId: null, name: 'Stories', languages: ['English'], genreCategory: 'cozy mystery',
  storyMode: 'standard', sourcePolicy: fiction, generationMode: 'review',
  postingRules: { autoProduce: { enabled: true, reelsPerDay: 1, startHourUtc: 0 } },
}
const pick = { seriesId: 'series', seriesName: 'Space', topicId: 'topic', subject: 'A discovery', genreCategory: 'science history', sourcePolicy: factual, narrativeStyle: null }

describe('scheduled reels preserve the selected story contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.channels.mockResolvedValue([channel])
    mocks.select.mockReturnValue({ from: () => ({ where: async () => [{ value: 0 }] }) })
    mocks.values.mockReturnValue({ returning: async () => [{ id: 'reel' }] })
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.set.mockReturnValue({ where: async () => [] })
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.pick.mockResolvedValue(null)
    mocks.claim.mockResolvedValue(true)
    mocks.acquire.mockResolvedValue({ dossier: 'Verified sources', sources: [] })
  })

  it('sources a strict series inside a fiction channel with the series permissions', async () => {
    mocks.pick.mockResolvedValue(pick)
    await runAutoProduceTick()
    expect(mocks.acquire).toHaveBeenCalledWith(channel, pick.subject, factual)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ sourcePolicy: factual, genreCategory: 'science history', dossier: 'Verified sources' }))
    expect(mocks.enqueueStep).toHaveBeenCalledTimes(1)
  })

  it('creates no reel when a strict series has no usable sources', async () => {
    mocks.pick.mockResolvedValue(pick)
    mocks.acquire.mockResolvedValue(null)
    await runAutoProduceTick()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.enqueueStep).not.toHaveBeenCalled()
    expect(mocks.skip).toHaveBeenCalledWith('topic', expect.any(String))
  })

  it('respects a fictional series override inside a factual standard channel', async () => {
    mocks.channels.mockResolvedValue([{ ...channel, sourcePolicy: factual }])
    mocks.pick.mockResolvedValue({ ...pick, sourcePolicy: fiction })
    await runAutoProduceTick()
    expect(mocks.acquire).not.toHaveBeenCalled()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ sourcePolicy: fiction, genreCategory: pick.genreCategory }))
  })

  it('freezes the channel genre without a series', async () => {
    await runAutoProduceTick()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ genreCategory: 'cozy mystery', sourcePolicy: fiction }))
  })

  it('on a lost claim, freezes the channel fallback policy and genre together', async () => {
    const seriesPolicy = SourcePolicySchema.parse({ realPlaces: true, invention: 'constrained' })
    mocks.pick.mockResolvedValue({ ...pick, sourcePolicy: seriesPolicy })
    mocks.claim.mockResolvedValue(false)
    await runAutoProduceTick()
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ seriesId: null, seedIdea: null, dossier: null, genreCategory: 'cozy mystery', sourcePolicy: fiction }))
    expect(mocks.enqueueStep).toHaveBeenCalledTimes(1)
  })

  it('fails closed when a lost fictional-series claim would fall back to a factual channel', async () => {
    mocks.channels.mockResolvedValue([{ ...channel, sourcePolicy: factual }])
    mocks.pick.mockResolvedValue({ ...pick, sourcePolicy: fiction })
    mocks.claim.mockResolvedValue(false)
    await runAutoProduceTick()
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    expect(mocks.enqueueStep).not.toHaveBeenCalled()
  })

  it('keeps evidence-required series closed after a lost claim', async () => {
    mocks.pick.mockResolvedValue(pick)
    mocks.claim.mockResolvedValue(false)
    await runAutoProduceTick()
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
    expect(mocks.enqueueStep).not.toHaveBeenCalled()
  })

  it('does not create a source-free EBN reel even when its explicit policy is permissive', async () => {
    mocks.channels.mockResolvedValue([{ ...channel, storyMode: 'ebn' }])
    await runAutoProduceTick()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.enqueueStep).not.toHaveBeenCalled()
  })
})
