import { randomUUID } from 'node:crypto'
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { assets, channels, compilations, getDb, reels, users } from '@reels/db'
import type { SessionUser } from './auth.js'

const { getCurrentUser } = vi.hoisted(() => ({
  getCurrentUser: vi.fn<() => Promise<SessionUser | null>>(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser }))

import { callerMayUseStorageKey, requireApiUser, requireChannelOwner } from './api-access.js'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const USER_A_ID = randomUUID()
const USER_B_ID = randomUUID()
const CHANNEL_A_ID = randomUUID()
const CHANNEL_B_ID = randomUUID()
const REEL_A_ID = randomUUID()
const REEL_B_ID = randomUUID()
const COMPILATION_A_ID = randomUUID()

const user = (id: string, role = 'tester', status = 'active'): SessionUser => ({
  id,
  role,
  status,
  email: `${id}@example.test`,
  name: null,
  image: null,
})

describe('account status gate', () => {
  it.each(['pending', 'suspended'])('blocks a signed-in %s account before API work begins', async (status) => {
    getCurrentUser.mockResolvedValue(user(USER_A_ID, 'tester', status))

    const denied = await requireApiUser()

    expect(denied).toBeInstanceOf(Response)
    expect((denied as Response).status).toBe(403)
    await expect((denied as Response).json()).resolves.toEqual({ error: 'Account is not active' })
  })
})

describe.skipIf(!TEST_DATABASE_URL)('database-backed tenant isolation', () => {
  beforeAll(async () => {
    process.env['DATABASE_URL'] = TEST_DATABASE_URL
    const db = getDb()
    await db.insert(users).values([
      { id: USER_A_ID, email: `${USER_A_ID}@example.test`, role: 'tester', status: 'active' },
      { id: USER_B_ID, email: `${USER_B_ID}@example.test`, role: 'tester', status: 'active' },
    ])
    await db.insert(channels).values([
      { id: CHANNEL_A_ID, userId: USER_A_ID, name: 'Tenant A', nicheDescription: 'A' },
      { id: CHANNEL_B_ID, userId: USER_B_ID, name: 'Tenant B', nicheDescription: 'B' },
    ])
    await db.insert(reels).values([
      { id: REEL_A_ID, channelId: CHANNEL_A_ID },
      { id: REEL_B_ID, channelId: CHANNEL_B_ID },
    ])
    await db.insert(compilations).values({ id: COMPILATION_A_ID, channelId: CHANNEL_A_ID, title: 'A compilation' })
    await db.insert(assets).values([
      { channelId: CHANNEL_A_ID, kind: 'image', storageKey: 'avatars/legacy-a.webp', provider: 'upload' },
      { channelId: CHANNEL_A_ID, kind: 'image', storageKey: 'avatars/draft-a.webp', provider: 'legacy_backfill' },
      { reelId: REEL_A_ID, kind: 'music', storageKey: 'channel-music/legacy-a.mp3', provider: 'upload' },
      { channelId: CHANNEL_A_ID, kind: 'image', storageKey: 'avatars/ambiguous.webp', provider: 'upload' },
      { channelId: CHANNEL_B_ID, kind: 'image', storageKey: 'avatars/ambiguous.webp', provider: 'upload' },
    ])
  })

  afterAll(async () => {
    const db = getDb()
    await db.delete(channels).where(inArray(channels.id, [CHANNEL_A_ID, CHANNEL_B_ID]))
    await db.delete(users).where(inArray(users.id, [USER_A_ID, USER_B_ID]))
  })

  it('allows the owner and denies a second user across private resource namespaces', async () => {
    const privateKeys = [
      `channels/${CHANNEL_A_ID}/avatar/a.webp`,
      `reels/${REEL_A_ID}/scenes/0.webp`,
      `compilations/${COMPILATION_A_ID}/final.mp4`,
      `audio/reel/${REEL_A_ID}-legacy.mp3`,
      'avatars/legacy-a.webp',
      'avatars/draft-a.webp',
      'channel-music/legacy-a.mp3',
    ]
    for (const key of privateKeys) {
      await expect(callerMayUseStorageKey(user(USER_A_ID), key)).resolves.toBe(true)
      await expect(callerMayUseStorageKey(user(USER_B_ID), key)).resolves.toBe(false)
    }
  })

  it('allows explicit shared presets and fails closed for unknown or malformed keys', async () => {
    await expect(callerMayUseStorageKey(user(USER_B_ID), 'style-presets/general/noir.webp')).resolves.toBe(true)
    await expect(callerMayUseStorageKey(user(USER_A_ID), 'misc/unowned.webp')).resolves.toBe(false)
    await expect(callerMayUseStorageKey(user(USER_A_ID), `reels/${REEL_A_ID}/../${REEL_B_ID}.webp`)).resolves.toBe(false)
    await expect(callerMayUseStorageKey(user(USER_A_ID), 'avatars/ambiguous.webp')).resolves.toBe(false)
    await expect(callerMayUseStorageKey(user(USER_B_ID), 'avatars/ambiguous.webp')).resolves.toBe(false)
    await expect(callerMayUseStorageKey(user(USER_A_ID, 'admin'), 'avatars/ambiguous.webp')).resolves.toBe(true)
    await expect(callerMayUseStorageKey(user(USER_A_ID, 'admin'), `channels/${randomUUID()}/missing.webp`)).resolves.toBe(false)
  })

  it('returns 404—not 403—when a representative API owner gate sees a foreign id', async () => {
    getCurrentUser.mockResolvedValue(user(USER_A_ID))
    await expect(requireChannelOwner(CHANNEL_A_ID)).resolves.toMatchObject({ id: USER_A_ID })

    getCurrentUser.mockResolvedValue(user(USER_B_ID))
    const denied = await requireChannelOwner(CHANNEL_A_ID)
    expect(denied).toBeInstanceOf(Response)
    expect((denied as Response).status).toBe(404)

    const db = getDb()
    const [stillOwned] = await db.select({ ownerId: channels.userId }).from(channels).where(eq(channels.id, CHANNEL_A_ID))
    expect(stillOwned?.ownerId).toBe(USER_A_ID)
  })
})
