import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray, sql } from 'drizzle-orm'
import { assets, channels, getDb, publications, recordPublication, reels, users } from '@reels/db'
import type * as Database from '@reels/db'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), truth: vi.fn(), connectionError: vi.fn() }))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  assertVisualTruthReady: mocks.truth, markConnectionError: mocks.connectionError,
}))
vi.mock('@reels/providers', () => ({
  uploadToYouTube: mocks.upload, downloadBuffer: mocks.download, toElevenLabsLang: () => 'en', listVoices: vi.fn(),
}))
vi.mock('@reels/queue', () => ({ enqueueStep: vi.fn(), makeQueue: vi.fn(), QUEUE: { SCHEDULER: 'scheduler' } }))
vi.mock('./pipeline/harness.js', () => ({ setReelStatus: vi.fn() }))
import { autoPublishYouTube } from './pipeline/auto-gate.js'
import { runPublishPromote } from './publish-promote.js'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const userId = randomUUID()
const channelIds: string[] = []
const auth = { clientId: 'fixture', clientSecret: 'fixture', refreshToken: 'fixture' }
let channelId: string
let reelId: string

async function state() {
  const reel = await getDb().query.reels.findFirst({ where: eq(reels.id, reelId) })
  const posts = await getDb().query.publications.findMany({ where: eq(publications.reelId, reelId) })
  return { reel: reel!, posts }
}

describe.skipIf(!TEST_DATABASE_URL)('publication aggregation across worker uploads and scheduled promotion', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DATABASE_URL
    await getDb().insert(users).values({ id: userId, email: `${userId}@example.test`, status: 'active' })
  })
  beforeEach(async () => {
    vi.resetAllMocks()
    channelId = randomUUID()
    reelId = randomUUID()
    channelIds.push(channelId)
    mocks.truth.mockResolvedValue(undefined)
    mocks.download.mockResolvedValue(Buffer.from('fixture video'))
    mocks.upload.mockResolvedValue({ videoId: 'fixture-video', url: 'https://youtu.be/fixture-video' })
    await getDb().insert(channels).values({
      id: channelId, userId, name: 'Publication test', nicheDescription: 'Fixture',
      targetPlatforms: ['youtube_shorts', 'instagram_reels'],
    })
    await getDb().insert(reels).values({ id: reelId, channelId, status: 'approved' })
    await getDb().insert(assets).values({ reelId, kind: 'render', provider: 'fixture', storageKey: `reels/${reelId}/render.mp4` })
  })
  afterAll(async () => {
    if (channelIds.length) await getDb().delete(channels).where(inArray(channels.id, channelIds))
    await getDb().delete(users).where(eq(users.id, userId))
  })

  it('keeps a mixed destination reel approved after YouTube upload and completes after the remaining confirmation', async () => {
    await autoPublishYouTube(reelId, null, auth)
    expect(mocks.upload).toHaveBeenCalledOnce()
    expect((await state()).reel.status).toBe('approved')
    expect((await state()).posts).toMatchObject([{ platform: 'yt', platformPostId: 'fixture-video', status: 'published', postUrl: 'https://youtu.be/fixture-video' }])
    await recordPublication({ reelId, platform: 'ig', kind: 'manual' })
    expect((await state()).reel.status).toBe('published')
  })

  it('completes when provider upload is the last remaining destination', async () => {
    await recordPublication({ reelId, platform: 'ig', kind: 'manual' })
    await autoPublishYouTube(reelId, null, auth)
    expect((await state()).reel.status).toBe('published')
  })

  it('serializes a provider result racing another destination confirmation', async () => {
    await Promise.all([autoPublishYouTube(reelId, null, auth), recordPublication({ reelId, platform: 'ig', kind: 'manual' })])
    expect((await state()).reel.status).toBe('published')
    expect((await state()).posts).toHaveLength(2)
  })

  it('does not replace a manual YouTube confirmation with an upload', async () => {
    await recordPublication({ reelId, platform: 'yt', kind: 'manual' })
    await autoPublishYouTube(reelId, null, auth)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect(mocks.download).not.toHaveBeenCalled()
    expect((await state()).posts[0]?.platformPostId).toBeNull()
  })

  it('does not upload YouTube when the channel no longer selects it', async () => {
    await getDb().update(channels).set({ targetPlatforms: ['instagram_reels'] }).where(eq(channels.id, channelId))
    await autoPublishYouTube(reelId, null, auth)
    expect(mocks.upload).not.toHaveBeenCalled()
    expect((await state()).posts).toHaveLength(0)
  })

  it('keeps visual-truth failures ahead of every provider call', async () => {
    mocks.truth.mockRejectedValue(new Error('flagged scene'))
    await expect(autoPublishYouTube(reelId, null, auth)).rejects.toThrow('flagged scene')
    expect(mocks.upload).not.toHaveBeenCalled()
    expect((await state()).posts).toHaveLength(0)
  })

  it('keeps a scheduled YouTube destination incomplete and promotes without completing remaining Instagram', async () => {
    const slot = new Date(Date.now() - 1000)
    await autoPublishYouTube(reelId, slot, auth)
    expect((await state()).reel.status).toBe('scheduled')
    expect((await state()).posts[0]).toMatchObject({ status: 'scheduled', publishedAt: null, scheduledAt: slot })
    await runPublishPromote()
    expect((await state()).reel.status).toBe('scheduled')
    expect((await state()).posts[0]).toMatchObject({ status: 'published', publishedAt: slot })
    await recordPublication({ reelId, platform: 'ig', kind: 'manual' })
    expect((await state()).reel.status).toBe('published')
  })

  it('promotes the last selected destination atomically and preserves the first publication timestamp', async () => {
    const slot = new Date(Date.now() - 1000)
    await autoPublishYouTube(reelId, slot, auth)
    await recordPublication({ reelId, platform: 'ig', kind: 'manual' })
    await Promise.all([runPublishPromote(), runPublishPromote()])
    expect((await state()).reel.status).toBe('published')
    const first = await state()
    await runPublishPromote()
    expect(await state()).toEqual(first)
  })

  it('leaves future slots and failed reel state unchanged', async () => {
    const future = new Date(Date.now() + 60_000)
    await autoPublishYouTube(reelId, future, auth)
    await runPublishPromote()
    expect((await state()).posts[0]?.status).toBe('scheduled')
    await getDb().update(reels).set({ status: 'failed' }).where(eq(reels.id, reelId))
    await getDb().update(publications).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(publications.reelId, reelId))
    await runPublishPromote()
    expect((await state()).reel.status).toBe('failed')
    expect((await state()).posts[0]?.status).toBe('published')
  })

  it('does not complete a partially recognized destination set', async () => {
    await getDb().update(channels).set({ targetPlatforms: ['youtube_shorts', 'unknown'] }).where(eq(channels.id, channelId))
    await autoPublishYouTube(reelId, new Date(Date.now() - 1000), auth)
    await runPublishPromote()
    expect((await state()).reel.status).toBe('scheduled')
  })

  it('rolls back a provider row when the final aggregate status write fails', async () => {
    await recordPublication({ reelId, platform: 'ig', kind: 'manual' })
    const triggerName = `fail_completion_${randomUUID().replaceAll('-', '')}`
    const db = getDb()
    await db.execute(sql.raw(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.id = '${reelId}'::uuid AND NEW.status = 'published' THEN RAISE EXCEPTION 'Test status write failure'; END IF;
      RETURN NEW; END $$`))
    await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE UPDATE ON reels FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`))
    try {
      await expect(autoPublishYouTube(reelId, null, auth)).rejects.toThrow('Test status write failure')
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${triggerName} ON reels`))
      await db.execute(sql.raw(`DROP FUNCTION ${triggerName}()`))
    }
    expect((await state()).reel.status).toBe('approved')
    expect((await state()).posts.map((post) => post.platform)).toEqual(['ig'])
  })

  it('preserves a terminal legacy reel while reconciling a scheduled destination', async () => {
    const [post] = await getDb().insert(publications).values({ reelId, platform: 'yt', status: 'scheduled', scheduledAt: new Date(Date.now() - 1000) }).returning()
    await getDb().update(reels).set({ status: 'published' }).where(eq(reels.id, reelId))
    await runPublishPromote()
    expect((await state()).reel.status).toBe('published')
    expect((await state()).posts[0]).toMatchObject({ id: post!.id, status: 'published' })
    expect((await state()).posts).toHaveLength(1)
  })
})
