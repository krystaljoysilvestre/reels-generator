import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type * as Database from '@reels/db'
import { CAPTION_PRESETS } from '@reels/core'

const mocks = vi.hoisted(() => ({ owner: vi.fn(), reel: vi.fn(), channel: vi.fn(), limit: vi.fn() }))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  getDb: () => ({ query: { reels: { findFirst: mocks.reel }, channels: { findFirst: mocks.channel } } }),
}))
vi.mock('@/lib/api-access', () => ({ requireReelOwner: mocks.owner }))
vi.mock('@reels/providers', () => ({ checkRateLimit: mocks.limit }))
import { GET } from './route'

const reelId = '6cd1ea2b-7f8b-47c8-859c-33d039bd1500'
function request(id = reelId) { return new NextRequest(`https://app.example.test/api/pipeline/export-subtitles?reelId=${id}`) }

describe('subtitle downloads', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.owner.mockResolvedValue({ id: 'creator' })
    mocks.limit.mockResolvedValue({ ok: true })
    mocks.channel.mockResolvedValue({ captionStyle: { ...CAPTION_PRESETS.candid, enabled: false } })
    mocks.reel.mockResolvedValue({ channelId: 'channel', timings: {
      durationMs: 5000, scenes: [], sfxEvents: [], music: null, silenceDrop: null, warnings: [],
      subtitles: [{ startMs: 0, endMs: 2000, text: 'A keeper saves the lighthouse.', words: [] }],
    } })
  })
  it('returns the saved captions as a private SRT attachment', async () => {
    const response = await GET(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="subtitles.srt"')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.text()).toContain('00:00:00,000 --> 00:00:02,000\nA keeper saves the lighthouse.')
  })
  it('rejects malformed reel IDs before querying data', async () => {
    expect((await GET(request('invalid'))).status).toBe(400)
    expect(mocks.owner).not.toHaveBeenCalled()
    expect(mocks.reel).not.toHaveBeenCalled()
  })
  it('keeps foreign reels hidden before loading captions', async () => {
    mocks.owner.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }))
    expect((await GET(request())).status).toBe(404)
    expect(mocks.reel).not.toHaveBeenCalled()
  })
  it('does not offer a duplicate sidecar when captions are burned in', async () => {
    mocks.channel.mockResolvedValue({ captionStyle: CAPTION_PRESETS.candid })
    expect((await GET(request())).status).toBe(404)
  })
  it('does not invent subtitles for a reel with missing timings', async () => {
    mocks.reel.mockResolvedValue({ channelId: 'channel', timings: null })
    expect((await GET(request())).status).toBe(404)
  })
  it('limits repeated downloads before loading captions', async () => {
    mocks.limit.mockResolvedValue({ ok: false })
    expect((await GET(request())).status).toBe(429)
    expect(mocks.reel).not.toHaveBeenCalled()
  })
})
