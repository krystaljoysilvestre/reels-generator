import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type * as Database from '@reels/db'

const mocks = vi.hoisted(() => ({ owner: vi.fn(), limit: vi.fn(), truth: vi.fn(), record: vi.fn() }))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  visualTruthBlockers: mocks.truth, recordPublication: mocks.record,
}))
vi.mock('@/lib/api-access', () => ({ requireReelOwner: mocks.owner }))
vi.mock('@reels/providers', () => ({ checkRateLimit: mocks.limit }))
import { POST } from './route'

const reelId = '6cd1ea2b-7f8b-47c8-859c-33d039bd1500'
function request() {
  return new NextRequest('https://app.example.test/api/pipeline/mark-published', { method: 'POST', body: JSON.stringify({ reelId, platform: 'ig' }) })
}

describe('publication confirmation rate limits', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.owner.mockResolvedValue({ id: 'creator' })
    mocks.limit.mockResolvedValue({ ok: false })
    mocks.truth.mockResolvedValue([])
    mocks.record.mockResolvedValue({ reelStatus: 'approved', publication: { platform: 'ig', status: 'published', postUrl: null, platformPostId: null, publishedAt: new Date() } })
  })
  it('returns 429 before truth queries or publication writes', async () => {
    const response = await POST(request())
    expect(response.status).toBe(429)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('wait') })
    expect(mocks.limit).toHaveBeenCalledWith('publication:confirm:creator', 60, 60_000)
    expect(mocks.truth).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })
  it('checks ownership before touching the rate limiter', async () => {
    mocks.owner.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }))
    expect((await POST(request())).status).toBe(404)
    expect(mocks.limit).not.toHaveBeenCalled()
    expect(mocks.truth).not.toHaveBeenCalled()
    expect(mocks.record).not.toHaveBeenCalled()
  })
  it('allows a confirmation within the owner limit', async () => {
    mocks.limit.mockResolvedValue({ ok: true })
    expect((await POST(request())).status).toBe(200)
    expect(mocks.truth).toHaveBeenCalledWith(reelId)
    expect(mocks.record).toHaveBeenCalledOnce()
  })
})
