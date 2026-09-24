import { randomBytes, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { getDb, invites, users } from '@reels/db'

const cookie = vi.hoisted(() => ({ token: '', remove: vi.fn(), set: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookie.token ? { value: cookie.token } : undefined, delete: cookie.remove, set: cookie.set }) }))
import { consumeInviteForUser } from './invite'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const userIds: string[] = []
const inviteIds: string[] = []
let userId: string
let inviteId: string

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL invitation account boundaries', () => {
  beforeAll(() => { process.env['DATABASE_URL'] = TEST_DATABASE_URL })
  beforeEach(async () => {
    cookie.remove.mockClear()
    userId = randomUUID()
    inviteId = randomUUID()
    userIds.push(userId)
    inviteIds.push(inviteId)
    cookie.token = randomBytes(18).toString('hex')
    await getDb().insert(users).values({ id: userId, email: `${userId}@example.test`, status: 'pending' })
    await getDb().insert(invites).values({ id: inviteId, token: cookie.token, role: 'tester', expiresAt: new Date(Date.now() + 60_000) })
  })
  afterAll(async () => {
    if (inviteIds.length) await getDb().delete(invites).where(inArray(invites.id, inviteIds))
    if (userIds.length) await getDb().delete(users).where(inArray(users.id, userIds))
  })

  async function state() {
    const [user] = await getDb().select().from(users).where(eq(users.id, userId))
    const [invite] = await getDb().select().from(invites).where(eq(invites.id, inviteId))
    return { user: user!, invite: invite! }
  }

  it('activates an existing pending creator and consumes the invitation atomically', async () => {
    await consumeInviteForUser(userId)
    const { user, invite } = await state()
    expect(user.status).toBe('active')
    expect(invite.usedByUserId).toBe(userId)
    expect(invite.usedAt).toBeInstanceOf(Date)
    expect(cookie.remove).toHaveBeenCalledWith('invite_token')
  })

  it.each(['suspended', 'active'])('does not change an existing %s account or consume an admin invite', async (status) => {
    await getDb().update(users).set({ status }).where(eq(users.id, userId))
    await getDb().update(invites).set({ role: 'admin' }).where(eq(invites.id, inviteId))
    await consumeInviteForUser(userId)
    const { user, invite } = await state()
    expect(user).toMatchObject({ status, role: 'tester' })
    expect(invite.usedAt).toBeNull()
    expect(invite.usedByUserId).toBeNull()
  })

  it('enforces email binding and expiry before granting access', async () => {
    await getDb().update(invites).set({ email: 'different@example.test' }).where(eq(invites.id, inviteId))
    await consumeInviteForUser(userId)
    expect((await state()).user.status).toBe('pending')
    await getDb().update(invites).set({ email: `${userId}@example.test`, expiresAt: new Date(Date.now() - 1) }).where(eq(invites.id, inviteId))
    await consumeInviteForUser(userId)
    expect((await state()).user.status).toBe('pending')
    expect((await state()).invite.usedAt).toBeNull()
  })

  it('allows only one of two simultaneous pending creators to claim a shared invite', async () => {
    const secondId = randomUUID()
    userIds.push(secondId)
    await getDb().insert(users).values({ id: secondId, email: `${secondId}@example.test`, status: 'pending' })
    await Promise.all([consumeInviteForUser(userId), consumeInviteForUser(secondId)])
    const rows = await getDb().select().from(users).where(inArray(users.id, [userId, secondId]))
    expect(rows.filter((row) => row.status === 'active')).toHaveLength(1)
    const { invite } = await state()
    expect(invite.usedByUserId).toBe(rows.find((row) => row.status === 'active')!.id)
  })
})
