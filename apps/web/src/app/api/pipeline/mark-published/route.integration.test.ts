import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { eq, inArray, sql } from 'drizzle-orm'
import { channels, getDb, publications, reels, users } from '@reels/db'
import type * as Database from '@reels/db'

const mocks = vi.hoisted(() => ({ owner: vi.fn(), truth: vi.fn() }))
vi.mock('@/lib/api-access', () => ({ requireReelOwner: mocks.owner }))
vi.mock('@reels/db', async () => ({
  ...await vi.importActual<typeof Database>('@reels/db'),
  visualTruthBlockers: mocks.truth,
}))
import { POST } from './route'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const userId = randomUUID()
const channelIds: string[] = []
let channelId: string
let reelId: string

function request(body: unknown = { reelId }) {
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
    await getDb().insert(channels).values({
      id: channelId, userId, name: 'Publication test', nicheDescription: 'Fixture',
      targetPlatforms: ['youtube_shorts', 'youtube_long', 'tiktok', 'facebook_reels'],
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
    expect((await state()).reel.status).toBe('published')
    expect((await state()).posts).toHaveLength(3)
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
    expect(first.posts).toHaveLength(3)
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
    expect((await POST(request())).status).toBe(200)
    const { posts } = await state()
    expect(posts).toHaveLength(3)
    expect(posts.every((post) => post.status === 'published' && post.publishedAt instanceof Date)).toBe(true)
    expect(posts.find((post) => post.platform === 'tiktok')?.id).toBe(publicationId)
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

  it.each([null, {}, { reelId: 2 }, { reelId: 'not-a-uuid' }])('rejects malformed request %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.owner).not.toHaveBeenCalled()
  })
})
