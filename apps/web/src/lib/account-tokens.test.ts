import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Predicate = (row: Row) => boolean
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), invalidate: vi.fn(), hash: vi.fn() }))
vi.mock('@reels/db', () => ({
  getDb: mocks.getDb,
  users: { table: 'users', id: 'id', email: 'email', authVersion: 'authVersion' },
  verificationTokens: { table: 'tokens', identifier: 'identifier', token: 'token', expires: 'expires' },
}))
vi.mock('drizzle-orm', () => ({
  eq: (field: string, value: unknown) => (row: Row) => row[field] === value,
  gt: (field: string, value: Date) => (row: Row) => (row[field] as Date) > value,
  and: (...predicates: Predicate[]) => (row: Row) => predicates.every((predicate) => predicate(row)),
  sql: () => 'increment-auth-version',
}))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))
vi.mock('./user-profile', () => ({ invalidateUserProfile: mocks.invalidate }))

import { accountPasswordSchema, issueAccountToken, resetAccountPassword, verifyAccountEmail } from './account-tokens'

const USER_ID = '7ab34d6f-008a-4431-aa45-6919cfcf6879'
let account: Row
let tokens: Row[]
let failUpdate: boolean

// A small transactional store models consumed rows and rollback. Predicates come from the production
// expressions above, so wrong purpose, expiry, version, and hash comparisons fail these tests.
function testDb() {
  let queue = Promise.resolve()
  const tx = {
    select: () => ({ from: () => ({ where: (predicate: Predicate) => ({ for: async () => predicate(account) ? [{ ...account }] : [] }) }) }),
    delete: () => ({ where: (predicate: Predicate) => {
      const removed = tokens.filter(predicate)
      tokens = tokens.filter((row) => !predicate(row))
      return { then: (resolve: (value: undefined) => unknown) => resolve(undefined), returning: async () => removed }
    } }),
    insert: () => ({ values: async (row: Row) => { tokens.push(row) } }),
    update: () => ({ set: (patch: Row) => ({ where: async (predicate: Predicate) => {
      if (failUpdate) throw new Error('simulated write failure')
      if (!predicate(account)) return
      const next = { ...patch }
      if (next.authVersion === 'increment-auth-version') next.authVersion = Number(account.authVersion) + 1
      account = { ...account, ...next }
    } }) }),
  }
  return {
    transaction: <T>(fn: (value: typeof tx) => Promise<T>) => {
      const result = queue.then(async () => {
        const beforeTokens = [...tokens]
        const beforeAccount = { ...account }
        try { return await fn(tx) } catch (error) {
          tokens = beforeTokens
          account = beforeAccount
          throw error
        }
      })
      queue = result.then(() => undefined, () => undefined)
      return result
    },
  }
}

describe('account token security', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('SIGNUP_MODE', 'approval')
    account = { id: USER_ID, email: 'creator@example.test', status: 'pending', authVersion: 0, passwordHash: 'old-hash', emailVerified: null }
    tokens = []
    failUpdate = false
    mocks.getDb.mockReturnValue(testDb())
    mocks.hash.mockResolvedValue('new-bcrypt-hash')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('stores only a hash and an expiry, and a newer link supersedes the old one', async () => {
    const first = await issueAccountToken(USER_ID, 'verify')
    const second = await issueAccountToken(USER_ID, 'verify')
    expect(second).not.toBe(first)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].token).toBe(createHash('sha256').update(second.split('.')[1]).digest('hex'))
    expect(JSON.stringify(tokens)).not.toContain(second.split('.')[1])
    expect(JSON.stringify(tokens)).not.toContain('creator@example.test')
    expect((tokens[0].expires as Date).getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000)
    await expect(verifyAccountEmail(first)).resolves.toBe(false)
    await expect(verifyAccountEmail(second)).resolves.toBe(true)
    await expect(verifyAccountEmail(second)).resolves.toBe(false)
  })

  it('cannot use a verification token to reset a password or an expired token to verify', async () => {
    const token = await issueAccountToken(USER_ID, 'verify')
    await expect(resetAccountPassword(token, 'new-password')).resolves.toBe(false)
    expect(account.passwordHash).toBe('old-hash')
    tokens[0].expires = new Date(Date.now() - 1)
    await expect(verifyAccountEmail(token)).resolves.toBe(false)
    expect(account.emailVerified).toBeNull()
  })

  it('grants access only when signup is explicitly open; verification otherwise preserves approval', async () => {
    await verifyAccountEmail(await issueAccountToken(USER_ID, 'verify'))
    expect(account.emailVerified).toBeInstanceOf(Date)
    expect(account.status).toBe('pending')
    vi.stubEnv('SIGNUP_MODE', 'open')
    await verifyAccountEmail(await issueAccountToken(USER_ID, 'verify'))
    expect(account.status).toBe('active')
    expect(mocks.invalidate).toHaveBeenCalledWith(USER_ID)
  })

  it('cannot reactivate a suspended account', async () => {
    const token = await issueAccountToken(USER_ID, 'verify')
    account.status = 'suspended'
    vi.stubEnv('SIGNUP_MODE', 'open')
    await expect(verifyAccountEmail(token)).resolves.toBe(false)
    expect(account.status).toBe('suspended')
    expect(account.emailVerified).toBeNull()
  })

  it.each(['pending', 'suspended', 'active'])('resets a %s password and revokes sessions without changing access or verifying email', async (status) => {
    account.status = status
    const verification = await issueAccountToken(USER_ID, 'verify')
    const reset = await issueAccountToken(USER_ID, 'reset')
    await expect(resetAccountPassword(reset, 'new-password')).resolves.toBe(true)
    expect(account).toMatchObject({ passwordHash: 'new-bcrypt-hash', authVersion: 1, status, emailVerified: null })
    expect(mocks.invalidate).toHaveBeenCalledWith(USER_ID)
    await expect(resetAccountPassword(reset, 'another-password')).resolves.toBe(false)
    await expect(verifyAccountEmail(verification)).resolves.toBe(false)
  })

  it('binds a link to the email and auth version that requested it', async () => {
    const token = await issueAccountToken(USER_ID, 'verify')
    account.email = 'changed@example.test'
    await expect(verifyAccountEmail(token)).resolves.toBe(false)
    account.email = 'creator@example.test'
    account.authVersion = 1
    await expect(verifyAccountEmail(token)).resolves.toBe(false)
  })

  it('consumes a token once across simultaneous attempts', async () => {
    const token = await issueAccountToken(USER_ID, 'reset')
    const results = await Promise.all([resetAccountPassword(token, 'new-password'), resetAccountPassword(token, 'other-password')])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(account.authVersion).toBe(1)
  })

  it('rolls back consumption if the account write fails', async () => {
    const token = await issueAccountToken(USER_ID, 'verify')
    failUpdate = true
    await expect(verifyAccountEmail(token)).rejects.toThrow('simulated write failure')
    expect(tokens).toHaveLength(1)
    expect(mocks.invalidate).not.toHaveBeenCalled()
    failUpdate = false
    await expect(verifyAccountEmail(token)).resolves.toBe(true)
  })

  it('rejects malformed tokens and passwords beyond bcrypt’s UTF-8 byte limit before hashing', async () => {
    expect(accountPasswordSchema.safeParse('é'.repeat(36)).success).toBe(true)
    expect(accountPasswordSchema.safeParse('é'.repeat(37)).success).toBe(false)
    const token = await issueAccountToken(USER_ID, 'reset')
    await expect(resetAccountPassword(token, 'é'.repeat(37))).resolves.toBe(false)
    await expect(resetAccountPassword('wrong', 'new-password')).resolves.toBe(false)
    expect(mocks.hash).not.toHaveBeenCalled()
  })
})
