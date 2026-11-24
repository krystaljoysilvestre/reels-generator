import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Database from '@reels/db'

const mocks = vi.hoisted(() => ({ channels: vi.fn(), reels: vi.fn(), count: vi.fn(), fetch: vi.fn() }))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  getDb: () => ({
    query: { channels: { findMany: mocks.channels }, reels: { findMany: mocks.reels } },
    select: () => ({ from: () => ({ where: mocks.count }) }),
  }),
}))
vi.mock('@reels/queue', () => ({ makeQueue: vi.fn(), QUEUE: { SCHEDULER: 'scheduler' } }))
import { runDailyDigest } from './digest.js'

const channel = { id: 'channel', name: 'Fixture', status: 'active', generationMode: 'review', targetPlatforms: ['youtube_shorts', 'instagram_reels'], postingRules: {} }
function scheduled(publications: { platform: string; status: string }[]) {
  return { status: 'scheduled', alertNote: null, publications }
}
function email() { return JSON.parse(mocks.fetch.mock.calls[0]![1].body as string) as { subject: string; html: string } }

describe('publishing handoff in the daily digest', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubEnv('RESEND_API_KEY', 'fixture')
    vi.stubEnv('DIGEST_EMAIL_TO', 'operator@example.test')
    vi.stubEnv('DIGEST_EMAIL_FROM', 'digest@example.test')
    vi.stubGlobal('fetch', mocks.fetch)
    mocks.fetch.mockResolvedValue({ ok: true })
    mocks.channels.mockResolvedValue([channel])
    mocks.count.mockResolvedValue([{ n: 0 }])
    mocks.reels.mockResolvedValue([])
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it.each(['scheduled', 'published'])('keeps missing Instagram actionable when YouTube is %s', async (status) => {
    mocks.reels.mockResolvedValue([scheduled([{ platform: 'yt', status }])])
    await runDailyDigest()
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(email().subject).toBe('1 reel ready to post')
    expect(email().html).toContain('1 ready to post')
    expect(email().html).not.toContain('waiting for their posting time')
  })

  it.each(['pending', 'failed'])('keeps an unfinished %s destination actionable', async (status) => {
    mocks.reels.mockResolvedValue([scheduled([{ platform: 'yt', status: 'published' }, { platform: 'ig', status }])])
    await runDailyDigest()
    expect(mocks.fetch).toHaveBeenCalledOnce()
    expect(email().subject).toBe('1 reel ready to post')
  })

  it('does not treat an already scheduled YouTube destination as manual work', async () => {
    mocks.channels.mockResolvedValue([{ ...channel, targetPlatforms: ['youtube_shorts'] }])
    mocks.reels.mockResolvedValue([scheduled([{ platform: 'yt', status: 'scheduled' }])])
    await runDailyDigest()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('stays quiet when Instagram is confirmed and YouTube is waiting for its slot', async () => {
    mocks.reels.mockResolvedValue([scheduled([{ platform: 'yt', status: 'scheduled' }, { platform: 'ig', status: 'published' }])])
    await runDailyDigest()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('ignores historical destinations when deciding whether a selected destination needs posting', async () => {
    mocks.channels.mockResolvedValue([{ ...channel, targetPlatforms: ['youtube_shorts'] }])
    mocks.reels.mockResolvedValue([scheduled([{ platform: 'yt', status: 'scheduled' }, { platform: 'ig', status: 'failed' }])])
    await runDailyDigest()
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('counts waiting reels separately when another reel makes the digest actionable', async () => {
    mocks.reels.mockResolvedValue([
      { status: 'approved', alertNote: null, publications: [] },
      scheduled([{ platform: 'yt', status: 'scheduled' }, { platform: 'ig', status: 'published' }]),
    ])
    await runDailyDigest()
    expect(email().subject).toBe('1 reel ready to post')
    expect(email().html).toContain('1 waiting for their posting time')
  })
})
