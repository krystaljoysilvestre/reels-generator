import { randomUUID } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { channels, getDb, reels, users } from '@reels/db'
import type * as Core from '@reels/core'

const { enqueueStep } = vi.hoisted(() => ({ enqueueStep: vi.fn() }))
vi.mock('@reels/queue', () => ({ enqueueStep, makeQueue: vi.fn(), QUEUE: { SCHEDULER: 'scheduler' } }))
vi.mock('./series-queue.js', () => ({
  pickNextSeriesTopic: vi.fn().mockResolvedValue(null),
  claimSeriesTopic: vi.fn(), skipSeriesTopic: vi.fn(), acquireEvidence: vi.fn(),
}))
vi.mock('@reels/core', async (original) => ({
  ...await original<typeof Core>(),
  MAX_INFLIGHT_REELS_PER_USER: 5,
}))

import { runAutoProduceTick } from './scheduler.js'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
let ownerId: string
let automaticChannelId: string
let manualChannelId: string
const old = () => new Date(Date.now() - 48 * 60 * 60 * 1000)

describe.skipIf(!TEST_DATABASE_URL)('automatic backlog versus creator production slots', () => {
  beforeAll(() => { process.env['DATABASE_URL'] = TEST_DATABASE_URL })
  beforeEach(async () => {
    vi.clearAllMocks()
    ownerId = randomUUID()
    automaticChannelId = randomUUID()
    manualChannelId = randomUUID()
    const db = getDb()
    await db.insert(users).values({ id: ownerId, email: `${ownerId}@example.test`, role: 'tester', status: 'active' })
    await db.insert(channels).values([
      {
        id: automaticChannelId, userId: ownerId, name: 'Automatic channel', nicheDescription: 'Fiction', status: 'active',
        postingRules: { autoProduce: { enabled: true, reelsPerDay: 1, startHourUtc: 0 } },
      },
      { id: manualChannelId, userId: ownerId, name: 'Manual channel', nicheDescription: 'Fiction' },
    ])
  })
  afterEach(async () => {
    await getDb().delete(channels).where(inArray(channels.id, [automaticChannelId, manualChannelId]))
    await getDb().delete(users).where(eq(users.id, ownerId))
  })

  it('can create on a clear channel when another owned channel has five completed reels', async () => {
    await getDb().insert(reels).values(Array.from({ length: 5 }, () => ({
      id: randomUUID(), channelId: manualChannelId, status: 'approved' as const, createdAt: old(),
    })))
    await runAutoProduceTick()
    const made = await getDb().query.reels.findMany({ where: eq(reels.channelId, automaticChannelId) })
    expect(made).toHaveLength(1)
    expect(enqueueStep).toHaveBeenCalledWith(expect.objectContaining({ reelId: made[0]!.id }))
  })

  it('still pauses a channel with three approved reels waiting to be posted', async () => {
    await getDb().insert(reels).values(Array.from({ length: 3 }, () => ({
      id: randomUUID(), channelId: automaticChannelId, status: 'approved' as const, createdAt: old(),
    })))
    await runAutoProduceTick()
    expect(await getDb().query.reels.findMany({ where: eq(reels.channelId, automaticChannelId) })).toHaveLength(3)
    expect(enqueueStep).not.toHaveBeenCalled()
  })

  it('still pauses new automatic production when the creator has five unfinished reels elsewhere', async () => {
    await getDb().insert(reels).values(Array.from({ length: 5 }, () => ({
      id: randomUUID(), channelId: manualChannelId, status: 'storyboard' as const, createdAt: old(),
    })))
    await runAutoProduceTick()
    expect(await getDb().query.reels.findMany({ where: eq(reels.channelId, automaticChannelId) })).toHaveLength(0)
    expect(enqueueStep).not.toHaveBeenCalled()
  })
})
