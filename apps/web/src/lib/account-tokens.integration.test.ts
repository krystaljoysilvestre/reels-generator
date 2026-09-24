import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq, like } from 'drizzle-orm'
import { getDb, users, verificationTokens } from '@reels/db'
import bcrypt from 'bcryptjs'
import { issueAccountToken, resetAccountPassword, verifyAccountEmail } from './account-tokens'

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL']
const ids: string[] = []
let userId: string

describe.skipIf(!TEST_DATABASE_URL)('PostgreSQL account token transactions', () => {
  beforeAll(() => { process.env['DATABASE_URL'] = TEST_DATABASE_URL })
  beforeEach(async () => {
    vi.stubEnv('SIGNUP_MODE', 'open')
    userId = randomUUID()
    ids.push(userId)
    await getDb().insert(users).values({ id: userId, email: `${userId}@example.test`, status: 'pending', passwordHash: 'old-hash' })
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const id of ids) {
      await getDb().delete(verificationTokens).where(like(verificationTokens.identifier, `account:%:${id}:%`))
      await getDb().delete(users).where(eq(users.id, id))
    }
  })

  async function account() {
    const [row] = await getDb().select().from(users).where(eq(users.id, userId))
    return row!
  }

  it('allows exactly one concurrent reset and revokes the previous session version', async () => {
    const token = await issueAccountToken(userId, 'reset')
    const results = await Promise.all([
      resetAccountPassword(token, 'new-password'),
      resetAccountPassword(token, 'new-password'),
    ])
    expect(results.filter(Boolean)).toHaveLength(1)
    const row = await account()
    expect(row.authVersion).toBe(1)
    expect(row.status).toBe('pending')
    expect(row.emailVerified).toBeNull()
    await expect(bcrypt.compare('new-password', row.passwordHash!)).resolves.toBe(true)
    await expect(resetAccountPassword(token, 'another-password')).resolves.toBe(false)
  })

  it('rejects expired and wrong-purpose links without mutating the account', async () => {
    const token = await issueAccountToken(userId, 'verify')
    await expect(resetAccountPassword(token, 'new-password')).resolves.toBe(false)
    await getDb().update(verificationTokens).set({ expires: new Date(Date.now() - 1000) })
      .where(like(verificationTokens.identifier, `account:verify:${userId}:%`))
    await expect(verifyAccountEmail(token)).resolves.toBe(false)
    expect(await account()).toMatchObject({ status: 'pending', emailVerified: null, authVersion: 0, passwordHash: 'old-hash' })
  })

  it('consumes verification once and activates a pending user only in open mode', async () => {
    vi.stubEnv('SIGNUP_MODE', 'approval')
    const token = await issueAccountToken(userId, 'verify')
    await expect(verifyAccountEmail(token)).resolves.toBe(true)
    expect((await account()).status).toBe('pending')
    await expect(verifyAccountEmail(token)).resolves.toBe(false)
    vi.stubEnv('SIGNUP_MODE', 'open')
    await expect(verifyAccountEmail(await issueAccountToken(userId, 'verify'))).resolves.toBe(true)
    expect((await account()).status).toBe('active')
  })

  it('does not reactivate suspended users through verification or recovery', async () => {
    const verify = await issueAccountToken(userId, 'verify')
    const reset = await issueAccountToken(userId, 'reset')
    await getDb().update(users).set({ status: 'suspended' }).where(eq(users.id, userId))
    await expect(verifyAccountEmail(verify)).resolves.toBe(false)
    await expect(resetAccountPassword(reset, 'new-password')).resolves.toBe(true)
    expect(await account()).toMatchObject({ status: 'suspended', emailVerified: null, authVersion: 1 })
  })

  it('keeps only the newest issued link and binds it to the current address', async () => {
    const first = await issueAccountToken(userId, 'verify')
    const latest = await issueAccountToken(userId, 'verify')
    await expect(verifyAccountEmail(first)).resolves.toBe(false)
    await getDb().update(users).set({ email: `changed-${userId}@example.test` }).where(eq(users.id, userId))
    await expect(verifyAccountEmail(latest)).resolves.toBe(false)
  })
})
