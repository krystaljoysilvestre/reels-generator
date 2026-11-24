import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { channels, getDb, reels, users } from '@reels/db'
import type * as Core from '@reels/core'
import type { SessionUser } from './auth.js'

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }))
vi.mock('@reels/core', async (original) => ({
  ...await original<typeof Core>(),
  MAX_INFLIGHT_REELS_PER_USER: 5,
  GLOBAL_DAILY_SPEND_CAP_CENTS: null,
}))

import { requireReelCreationBudget, requireSpendBudget } from './api-access.js'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const ownerIds: string[] = []
const channelIds: string[] = []
type Status = NonNullable<typeof reels.$inferInsert.status>

async function creator(statuses: Status[], createdAt = new Date(Date.now() - 48 * 60 * 60 * 1000)) {
  const db = getDb()
  const id = randomUUID()
  const channelId = randomUUID()
  ownerIds.push(id)
  channelIds.push(channelId)
  await db.insert(users).values({
    id, email: `${id}@example.test`, role: 'tester', status: 'active',
    monthlyBudgetCents: 5000, dailyReelQuota: 2,
  })
  await db.insert(channels).values({ id: channelId, userId: id, name: 'Creator limits', nicheDescription: 'Test' })
  if (statuses.length) {
    await db.insert(reels).values(statuses.map((status) => ({ id: randomUUID(), channelId, status, createdAt })))
  }
  const user: SessionUser = { id, email: `${id}@example.test`, role: 'tester', status: 'active', name: null, image: null }
  return { user, channelId }
}

describe.skipIf(!TEST_DATABASE_URL)('creator production slots', () => {
  beforeAll(() => { process.env['DATABASE_URL'] = TEST_DATABASE_URL })
  afterAll(async () => {
    const db = getDb()
    if (channelIds.length) await db.delete(channels).where(inArray(channels.id, channelIds))
    if (ownerIds.length) await db.delete(users).where(inArray(users.id, ownerIds))
  })

  it.each(['approved', 'scheduled', 'published', 'failed', 'rejected'] as const)(
    'allows another project when five previous reels are %s', async (status) => {
      const { user } = await creator(Array.from({ length: 5 }, () => status))
      await expect(requireReelCreationBudget(user)).resolves.toBeNull()
    },
  )

  it.each(['drafting', 'story_review', 'bible_review', 'storyboard', 'rendering', 'render_qa', 'spot_check'] as const)(
    'keeps five %s reels within the unfinished-production limit', async (status) => {
      const { user } = await creator(Array.from({ length: 5 }, () => status))
      expect((await requireReelCreationBudget(user))?.status).toBe(429)
    },
  )

  it('counts the creator’s unfinished reels across channels without counting another creator’s work', async () => {
    const { user } = await creator(['storyboard', 'storyboard'])
    await creator(Array.from({ length: 5 }, () => 'storyboard'))
    await expect(requireReelCreationBudget(user)).resolves.toBeNull()

    const channelId = randomUUID()
    channelIds.push(channelId)
    await getDb().insert(channels).values({ id: channelId, userId: user.id, name: 'Second channel', nicheDescription: 'Test' })
    await getDb().insert(reels).values(Array.from({ length: 3 }, () => ({
      id: randomUUID(), channelId, status: 'story_review' as const,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    })))
    expect((await requireReelCreationBudget(user))?.status).toBe(429)
  })

  it('blocks new projects at the daily quota while allowing paid work on an existing project', async () => {
    const { user } = await creator(['approved', 'storyboard'], new Date())
    expect((await requireReelCreationBudget(user))?.status).toBe(429)
    await expect(requireSpendBudget(user)).resolves.toBeNull()
  })

  it('does not release the monthly spending guard when finished reels release their slots', async () => {
    const { user } = await creator(['approved'])
    await getDb().update(users).set({ monthlyBudgetCents: 0 }).where(eq(users.id, user.id))
    expect((await requireReelCreationBudget(user))?.status).toBe(429)
    expect((await requireSpendBudget(user))?.status).toBe(429)
  })
})
