import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq, inArray, sql } from 'drizzle-orm'
import { assets, channels, getDb, publications, reels, users } from '@reels/db'
import type * as Database from '@reels/db'

const mocks = vi.hoisted(() => ({ owner: vi.fn(), truth: vi.fn(), upload: vi.fn(), download: vi.fn(), auth: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/api-access', () => ({ requireReelOwner: mocks.owner }))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  visualTruthBlockers: mocks.truth, resolveYouTubeAuth: mocks.auth,
}))
vi.mock('@reels/providers', () => ({ uploadToYouTube: mocks.upload, downloadBuffer: mocks.download, toElevenLabsLang: () => 'en', checkRateLimit: mocks.limit }))
import { POST } from './route'
import { POST as uploadYouTube } from '../publish-youtube/route'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const userId = randomUUID()
const channelIds: string[] = []
let channelId: string
let reelId: string

function request(body: unknown = { reelId, platform: 'fb' }) {
  return new NextRequest('https://app.example.test/api/pipeline/mark-published', {
    method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' },
  })
}

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL manual publication confirmation', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DATABASE_URL
    await getDb().insert(users).values({ id: userId, email: `${userId}@example.test`, status: 'active' })
  })
  beforeEach(async () => {
    vi.resetAllMocks()
    channelId = randomUUID()
    reelId = randomUUID()
    channelIds.push(channelId)
    mocks.owner.mockResolvedValue({ id: userId, status: 'active', role: 'tester' })
    mocks.truth.mockResolvedValue([])
    mocks.limit.mockResolvedValue({ ok: true })
    await getDb().insert(channels).values({
      id: channelId, userId, name: 'Publication test', nicheDescription: 'Fixture',
      targetPlatforms: ['youtube_shorts', 'tiktok', 'facebook_reels', 'instagram_reels'],
    })
    await getDb().insert(reels).values({ id: reelId, channelId, status: 'approved' })
  })
  afterAll(async () => {
    if (channelIds.length) await getDb().delete(channels).where(inArray(channels.id, channelIds))
    await getDb().delete(users).where(eq(users.id, userId))
  })

  async function state() {
    const reel = await getDb().query.reels.findFirst({ where: eq(reels.id, reelId) })
    const posts = await getDb().query.publications.findMany({ where: eq(publications.reelId, reelId) })
    return { reel: reel!, posts }
  }

  it('rolls back every write if saving a destination fails, then accepts a retry', async () => {
    const triggerName = `fail_publication_${randomUUID().replaceAll('-', '')}`
    const db = getDb()
    // A real PostgreSQL write failure proves rollback, rather than a mocked transaction callback.
    await db.execute(sql.raw(`CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.reel_id = '${reelId}'::uuid AND NEW.platform = 'fb' THEN
        RAISE EXCEPTION 'Test destination write failure';
      END IF; RETURN NEW; END $$`))
    await db.execute(sql.raw(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON publications FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`))
    let response: Response | null
    try {
      response = await POST(request()).catch(() => null)
    } finally {
      await db.execute(sql.raw(`DROP TRIGGER ${triggerName} ON publications`))
      await db.execute(sql.raw(`DROP FUNCTION ${triggerName}()`))
    }
    expect((await state()).reel.status).toBe('approved')
    expect((await state()).posts).toHaveLength(0)
    expect(response?.status).toBe(500)
    expect((await POST(request())).status).toBe(200)
    expect((await state()).reel.status).toBe('approved')
    expect((await state()).posts).toHaveLength(1)
  })

  it('accepts repeated and concurrent confirmations without replacing IDs or timestamps', async () => {
    const publicationId = randomUUID()
    const publishedAt = new Date('2026-01-02T03:04:05Z')
    const scheduledAt = new Date('2026-01-01T03:04:05Z')
    await getDb().insert(publications).values({
      id: publicationId, reelId, platform: 'yt', platformPostId: 'existing-video', status: 'published',
      publishedAt, scheduledAt, disclosureApplied: true,
    })
    const responses = await Promise.all(Array.from({ length: 4 }, () => POST(request())))
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200])
    const first = await state()
    expect(first.posts).toHaveLength(2)
    expect(first.posts.find((post) => post.platform === 'yt')).toMatchObject({
      id: publicationId, platformPostId: 'existing-video', publishedAt, scheduledAt, disclosureApplied: true,
    })
    expect((await POST(request())).status).toBe(200)
    const repeated = await state()
    expect(repeated.reel.updatedAt).toEqual(first.reel.updatedAt)
    expect([...repeated.posts].sort((a, b) => a.platform.localeCompare(b.platform)))
      .toEqual([...first.posts].sort((a, b) => a.platform.localeCompare(b.platform)))
  })

  it('repairs a previously published reel missing destinations and confirms pending records', async () => {
    await getDb().update(reels).set({ status: 'published' }).where(eq(reels.id, reelId))
    const publicationId = randomUUID()
    await getDb().insert(publications).values({ id: publicationId, reelId, platform: 'tiktok', status: 'pending' })
    expect((await POST(request({ reelId, platform: 'tiktok' }))).status).toBe(200)
    const { posts, reel } = await state()
    expect(reel.status).toBe('published')
    expect(posts).toHaveLength(1)
    expect(posts.every((post) => post.status === 'published' && post.publishedAt instanceof Date)).toBe(true)
    expect(posts.find((post) => post.platform === 'tiktok')?.id).toBe(publicationId)
  })

  it('confirms only the chosen destination and completes after every selected destination', async () => {
    for (const platform of ['fb', 'ig', 'tiktok']) {
      const response = await POST(request({ reelId, platform }))
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({ ok: true, reelStatus: 'approved', publication: { platform, status: 'published', postUrl: null } })
    }
    expect((await state()).posts).toHaveLength(3)
    const response = await POST(request({ reelId, platform: 'yt' }))
    expect(await response.json()).toMatchObject({ reelStatus: 'published', publication: { platform: 'yt' } })
    expect((await state()).reel.status).toBe('published')
  })

  it('serializes concurrent confirmations of different destinations into final completion', async () => {
    const responses = await Promise.all(['fb', 'ig', 'tiktok', 'yt'].map((platform) => POST(request({ reelId, platform }))))
    expect(responses.every((response) => response.status === 200)).toBe(true)
    expect((await state()).reel.status).toBe('published')
    expect((await state()).posts).toHaveLength(4)
  })

  it('saves an optional URL while preserving the first confirmation timestamp on omission and edits', async () => {
    const response = await POST(request({ reelId, platform: 'ig', postUrl: 'https://www.instagram.com/reel/fixture/' }))
    expect(await response.json()).toMatchObject({ publication: { postUrl: 'https://www.instagram.com/reel/fixture/' } })
    const first = (await state()).posts[0]!
    await POST(request({ reelId, platform: 'ig' }))
    expect((await state()).posts[0]).toEqual(first)
    await POST(request({ reelId, platform: 'ig', postUrl: 'https://instagram.com/reel/corrected/' }))
    expect((await state()).posts[0]).toMatchObject({ id: first.id, publishedAt: first.publishedAt, postUrl: 'https://instagram.com/reel/corrected/' })
  })

  it.each([
    'http://instagram.com/reel/x', 'https://instagram.com.evil.test/reel/x',
    'https://evilinstagram.com/reel/x', 'https://user:secret@instagram.com/reel/x',
    'https://instagram.com:444/reel/x', 'javascript:alert(1)', 'https://youtube.com/watch?v=x',
  ])('rejects unsafe or mismatched post link %s', async (postUrl) => {
    expect((await POST(request({ reelId, platform: 'ig', postUrl }))).status).toBe(400)
    expect((await state()).posts).toHaveLength(0)
  })

  it.each([
    ['yt', 'https://youtu.be/fixture'], ['yt', 'https://www.youtube.com/shorts/fixture'],
    ['fb', 'https://fb.watch/fixture/'], ['fb', 'https://www.facebook.com/reel/123'],
    ['ig', 'https://www.instagram.com/reel/fixture/'], ['tiktok', 'https://vm.tiktok.com/fixture/'],
  ])('accepts known %s post links', async (platform, postUrl) => {
    expect((await POST(request({ reelId, platform, postUrl }))).status).toBe(200)
  })

  it('rejects a destination not selected on the channel', async () => {
    await getDb().update(channels).set({ targetPlatforms: ['tiktok'] }).where(eq(channels.id, channelId))
    expect((await POST(request({ reelId, platform: 'yt' }))).status).toBe(400)
    expect((await state()).posts).toHaveLength(0)
  })

  it.each([[], ['unrecognized'], ['facebook_reels', 'unrecognized']].map((targets) => [targets]))('never completes an empty or partially unknown set %j', async (targets) => {
    await getDb().update(channels).set({ targetPlatforms: targets }).where(eq(channels.id, channelId))
    const response = await POST(request())
    expect(response.status).toBe(targets.includes('facebook_reels') ? 200 : 400)
    expect((await state()).reel.status).toBe('approved')
  })

  it('coexists with direct YouTube upload as the last selected destination', async () => {
    await getDb().update(channels).set({ targetPlatforms: ['youtube_shorts', 'instagram_reels'] }).where(eq(channels.id, channelId))
    await getDb().insert(assets).values({ reelId, kind: 'render', provider: 'fixture', storageKey: `reels/${reelId}/render.mp4` })
    mocks.auth.mockResolvedValue({ clientId: 'fixture', clientSecret: 'fixture', refreshToken: 'fixture' })
    mocks.download.mockResolvedValue(Buffer.from('fixture'))
    mocks.upload.mockResolvedValue({ videoId: 'fixture-video', url: 'https://youtu.be/fixture-video' })
    await POST(request({ reelId, platform: 'ig' }))
    const response = await uploadYouTube(request({ reelId }))
    expect(await response.json()).toMatchObject({ ok: true, reelStatus: 'published', allDestinationsPublished: true, publication: { platform: 'yt', platformPostId: 'fixture-video' } })
    expect((await state()).reel.status).toBe('published')
    expect(mocks.upload).toHaveBeenCalledOnce()
  })

  it('does not let off-target historical rows prevent or satisfy selected completion', async () => {
    await getDb().update(channels).set({ targetPlatforms: ['instagram_reels'] }).where(eq(channels.id, channelId))
    await getDb().insert(publications).values({ reelId, platform: 'yt', status: 'scheduled', platformPostId: 'historical' })
    const response = await POST(request({ reelId, platform: 'ig' }))
    expect(await response.json()).toMatchObject({ reelStatus: 'published' })
    expect((await state()).posts.find((post) => post.platform === 'yt')).toMatchObject({ status: 'scheduled', platformPostId: 'historical' })
  })

  it('does not count a scheduled destination as published', async () => {
    await getDb().update(channels).set({ targetPlatforms: ['facebook_reels', 'youtube_shorts'] }).where(eq(channels.id, channelId))
    await getDb().update(reels).set({ status: 'scheduled' }).where(eq(reels.id, reelId))
    await getDb().insert(publications).values({ reelId, platform: 'yt', status: 'scheduled', scheduledAt: new Date(Date.now() + 3_600_000) })
    expect((await POST(request())).status).toBe(200)
    expect((await state()).reel.status).toBe('scheduled')
  })

  it.each(['drafting', 'spot_check', 'failed'] as const)('never confirms an unapproved %s reel', async (status) => {
    await getDb().update(reels).set({ status }).where(eq(reels.id, reelId))
    expect((await POST(request())).status).toBe(409)
    expect((await state()).reel.status).toBe(status)
    expect((await state()).posts).toHaveLength(0)
  })

  it('preserves ownership and visual-truth gates, including during reconciliation', async () => {
    mocks.owner.mockResolvedValue(NextResponse.json({ error: 'Not found' }, { status: 404 }))
    expect((await POST(request())).status).toBe(404)
    expect(mocks.truth).not.toHaveBeenCalled()
    mocks.owner.mockResolvedValue({ id: userId, status: 'active', role: 'tester' })
    await getDb().update(reels).set({ status: 'published' }).where(eq(reels.id, reelId))
    mocks.truth.mockResolvedValue([{ sceneId: 'flagged' }])
    expect((await POST(request())).status).toBe(409)
    expect((await state()).posts).toHaveLength(0)
  })

  it.each([null, {}, { reelId: 2 }, { reelId: 'not-a-uuid' }, { reelId: '70fbc550-be2c-40a5-9876-120126caaabc' }])('rejects malformed request %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.owner).not.toHaveBeenCalled()
  })
})
