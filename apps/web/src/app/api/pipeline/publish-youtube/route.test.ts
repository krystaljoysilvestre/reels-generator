import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type * as Database from '@reels/db'

const mocks = vi.hoisted(() => ({
  reel: vi.fn(), publication: vi.fn(), asset: vi.fn(), channel: vi.fn(), owner: vi.fn(), truth: vi.fn(),
  auth: vi.fn(), connectionError: vi.fn(), download: vi.fn(), upload: vi.fn(), origins: vi.fn(),
  insert: vi.fn(), values: vi.fn(), conflict: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(),
}))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  getDb: () => ({
    query: {
      reels: { findFirst: mocks.reel }, publications: { findFirst: mocks.publication },
      assets: { findFirst: mocks.asset }, channels: { findFirst: mocks.channel },
    },
    insert: mocks.insert, update: mocks.update,
  }),
  visualTruthBlockers: mocks.truth, resolveYouTubeAuth: mocks.auth,
  markConnectionError: mocks.connectionError, sceneImageOrigins: mocks.origins,
}))
vi.mock('@/lib/api-access', () => ({ requireReelOwner: mocks.owner }))
vi.mock('@reels/providers', () => ({
  downloadBuffer: mocks.download, uploadToYouTube: mocks.upload, toElevenLabsLang: () => 'en',
}))
import { POST } from './route'

const reelId = '70fbc550-be2c-40a5-9876-120126caaabc'
const reel = { id: reelId, channelId: 'channel', status: 'approved', story: { title: 'Saved story', logline: 'The story.' }, storyBible: null, timings: null }
function request(body: unknown = { reelId }) {
  return new NextRequest('https://app.example.test/api/pipeline/publish-youtube', { method: 'POST', body: JSON.stringify(body) })
}

describe('YouTube publication retries', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.owner.mockResolvedValue({ id: 'creator', status: 'active', role: 'tester' })
    mocks.reel.mockResolvedValue(reel)
    mocks.truth.mockResolvedValue([])
    mocks.auth.mockResolvedValue({ accessToken: 'test-only' })
    mocks.channel.mockResolvedValue({ targetPlatforms: ['youtube_shorts'], languages: ['english'] })
    mocks.asset.mockResolvedValueOnce({ storageKey: `reels/${reelId}/render.mp4` }).mockResolvedValue(null)
    mocks.download.mockResolvedValue(Buffer.from('test video'))
    mocks.upload.mockResolvedValue({ videoId: 'new-video', url: 'https://youtu.be/new-video' })
    mocks.insert.mockReturnValue({ values: mocks.values })
    mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.conflict })
    mocks.conflict.mockResolvedValue(undefined)
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.where })
    mocks.where.mockResolvedValue(undefined)
  })

  it.each(['approved', 'published'])('returns the saved upload for a %s reel even after disconnecting YouTube', async (status) => {
    mocks.reel.mockResolvedValue({ ...reel, status })
    mocks.publication.mockResolvedValue({ platformPostId: 'saved-video', status: 'published' })
    mocks.auth.mockResolvedValue(null)
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, already: true, videoUrl: 'https://youtu.be/saved-video' })
    expect(mocks.auth).not.toHaveBeenCalled()
    expect(mocks.asset).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not bypass the transition gate when a published reel has no recorded upload', async () => {
    mocks.reel.mockResolvedValue({ ...reel, status: 'published' })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('does not bypass approval for a reel with an old destination record', async () => {
    mocks.reel.mockResolvedValue({ ...reel, status: 'failed' })
    mocks.publication.mockResolvedValue({ platformPostId: 'saved-video' })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('keeps the owner and visual-truth gates ahead of saved-upload responses', async () => {
    mocks.owner.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }))
    expect((await POST(request())).status).toBe(404)
    expect(mocks.reel).not.toHaveBeenCalled()
    mocks.owner.mockResolvedValue({ id: 'creator', status: 'active', role: 'tester' })
    mocks.truth.mockResolvedValue([{ sceneId: 'flagged' }])
    mocks.publication.mockResolvedValue({ platformPostId: 'saved-video' })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.publication).not.toHaveBeenCalled()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it.each([
    { targets: ['youtube_shorts', 'youtube_long'], published: true },
    { targets: ['youtube_shorts', 'tiktok'], published: false },
  ])('preserves completion behavior for $targets', async ({ targets, published }) => {
    mocks.channel.mockResolvedValue({ targetPlatforms: targets, languages: ['english'] })
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ allDestinationsPublished: published })
    expect(mocks.upload).toHaveBeenCalledOnce()
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ platformPostId: 'new-video', status: 'published' }))
    expect(mocks.update).toHaveBeenCalledTimes(published ? 1 : 0)
    if (published) expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }))
  })

  it('leaves publication state untouched when an upload fails', async () => {
    mocks.upload.mockRejectedValue(new Error('test upload failure'))
    expect((await POST(request())).status).toBe(502)
    expect(mocks.connectionError).toHaveBeenCalledOnce()
    expect(mocks.insert).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([null, {}, { reelId: 2 }, { reelId: 'not-a-uuid' }])('rejects malformed request %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.owner).not.toHaveBeenCalled()
  })
})
