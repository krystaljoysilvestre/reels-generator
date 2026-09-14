import type * as DbModule from '@reels/db'
import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SourcePolicySchema } from '@reels/core'

const mocks = vi.hoisted(() => ({
  channel: vi.fn(), series: vi.fn(), story: vi.fn(), insert: vi.fn(), update: vi.fn(), select: vi.fn(),
  values: vi.fn(), set: vi.fn(), enqueueStep: vi.fn(), budget: vi.fn(), owns: vi.fn(),
}))
vi.mock('@reels/db', async (original) => ({
  ...await original<typeof DbModule>(),
  getDb: () => ({
    query: { channels: { findFirst: mocks.channel }, channelSeries: { findFirst: mocks.series }, stories: { findFirst: mocks.story } },
    insert: mocks.insert, update: mocks.update, select: mocks.select,
  }),
}))
vi.mock('@reels/queue', () => ({ enqueueStep: mocks.enqueueStep }))
vi.mock('@/lib/api-access', () => ({
  requireApiUser: async () => ({ id: 'owner' }),
  requireChannelOwner: async () => ({ id: 'owner' }),
  requireStoryOwner: async () => ({ id: 'owner' }),
  requireReelCreationBudget: mocks.budget,
}))
vi.mock('@/lib/access', () => ({ userOwnsChannel: mocks.owns }))

import { POST as create } from '@/app/api/pipeline/create-reel/route'
import { POST as provide } from '@/app/api/pipeline/provide-story/route'

const channelId = '00000000-0000-4000-8000-000000000001'
const seriesId = '00000000-0000-4000-8000-000000000002'
const fiction = SourcePolicySchema.parse({})
const factual = SourcePolicySchema.parse({ realEvents: true, evidenceRequired: true, invention: 'none' })
const channel = { id: channelId, languages: ['English'], genreCategory: 'cozy mystery', sourcePolicy: fiction, storyMode: 'standard' }
const request = (body: unknown) => ({ json: async () => body }) as NextRequest

describe('reel creation freezes the validated story contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.channel.mockResolvedValue(channel)
    mocks.series.mockResolvedValue(undefined)
    mocks.owns.mockResolvedValue(true)
    mocks.budget.mockResolvedValue(null)
    mocks.values.mockImplementation(() => ({ returning: async () => [{ id: 'new-reel' }] }))
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.set.mockReturnValue({ where: async () => [] })
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) })
  })

  it('rejects a stricter series without evidence before any mutation', async () => {
    mocks.series.mockResolvedValue({ id: seriesId, sourcePolicy: factual, genreCategory: 'documentary history' })
    expect((await create(request({ channelId, seriesId, generationMode: 'auto' }))).status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.enqueueStep).not.toHaveBeenCalled()
  })

  it('accepts a looser series and freezes its genre and policy together', async () => {
    mocks.channel.mockResolvedValue({ ...channel, sourcePolicy: factual })
    mocks.series.mockResolvedValue({ id: seriesId, sourcePolicy: fiction, genreCategory: 'romantic science fiction' })
    expect((await create(request({ channelId, seriesId }))).status).toBe(200)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ sourcePolicy: fiction, genreCategory: 'romantic science fiction', seriesId }))
  })

  it('persists the same strict policy whose evidence was validated', async () => {
    mocks.series.mockResolvedValue({ id: seriesId, sourcePolicy: factual, genreCategory: null })
    expect((await create(request({ channelId, seriesId, dossier: '  Source material  ' }))).status).toBe(200)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ sourcePolicy: factual, genreCategory: 'cozy mystery', dossier: 'Source material' }))
  })

  it('freezes a custom genre when no series was selected', async () => {
    expect((await create(request({ channelId }))).status).toBe(200)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ sourcePolicy: fiction, genreCategory: 'cozy mystery' }))
  })

  it('freezes genre for pasted scripts', async () => {
    expect((await provide(request({ channelId, body: 'A complete story.' }))).status).toBe(200)
    expect(mocks.values).toHaveBeenLastCalledWith(expect.objectContaining({ sourcePolicy: fiction, genreCategory: 'cozy mystery' }))
  })

  it('freezes genre for a saved library story', async () => {
    mocks.story.mockResolvedValue({ id: seriesId, channelId, source: 'user', language: 'english' })
    expect((await provide(request({ storyId: seriesId }))).status).toBe(200)
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ sourcePolicy: fiction, genreCategory: 'cozy mystery', storyId: seriesId }))
  })

  it('rejects malformed UUIDs before querying and hides a foreign series', async () => {
    expect((await create(request({ channelId, seriesId: 'invalid' }))).status).toBe(400)
    expect(mocks.channel).not.toHaveBeenCalled()
    expect((await create(request({ channelId, seriesId }))).status).toBe(404)
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
