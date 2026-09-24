import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
type Predicate = (row: Row) => boolean
const mocks = vi.hoisted(() => ({
  account: {} as Row, getProfile: vi.fn(), invalidate: vi.fn(), invite: vi.fn(), open: vi.fn(), rateLimit: vi.fn(), compare: vi.fn(),
}))
vi.mock('next-auth', () => ({ default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }) }))
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }))
vi.mock('@reels/providers', () => ({ checkRateLimit: mocks.rateLimit }))
vi.mock('bcryptjs', () => ({ default: { compare: mocks.compare } }))
vi.mock('@/lib/invite', () => ({ consumeInviteForUser: mocks.invite }))
vi.mock('@/lib/signup-policy', () => ({ isOpenSignup: mocks.open }))
vi.mock('@/lib/user-profile', () => ({ ACCOUNT_UNAVAILABLE: 'unavailable', getUserProfile: mocks.getProfile, invalidateUserProfile: mocks.invalidate }))
vi.mock('drizzle-orm', () => ({
  eq: (field: string, value: unknown) => (row: Row) => row[field] === value,
  and: (...predicates: Predicate[]) => (row: Row) => predicates.every((predicate) => predicate(row)),
}))
vi.mock('@reels/db', () => ({
  users: { id: 'id', email: 'email', status: 'status', authVersion: 'authVersion', emailVerified: 'emailVerified' }, accounts: {}, sessions: {}, verificationTokens: {},
  getDb: () => ({
    select: (projection?: Record<string, string>) => ({ from: () => ({ where: async (predicate: Predicate) => {
      if (!predicate(mocks.account)) return []
      return [projection ? Object.fromEntries(Object.entries(projection).map(([key, field]) => [key, mocks.account[field]])) : { ...mocks.account }]
    } }) }),
    update: () => ({ set: (patch: Row) => ({ where: (predicate: Predicate) => {
      const matched = predicate(mocks.account)
      if (matched) Object.assign(mocks.account, patch)
      const result = matched ? [{ id: mocks.account.id }] : []
      return Object.assign(Promise.resolve(result), { returning: async () => result })
    } }) }),
  }),
}))

import { authConfig } from './auth'

type Session = { user: { id?: string; status?: string; role?: string; name?: string | null; image?: string | null } }
const callbacks = authConfig.callbacks as unknown as {
  signIn: (args: { account: { provider: string }; profile?: Row }) => Promise<boolean>
  jwt: (args: { token: Row; user?: { id: string; authVersion?: number } }) => Promise<Row>
  session: (args: { session: Session; token: Row }) => Promise<Session>
}
const signedIn = authConfig.events!.signIn as unknown as (args: { user: { id: string }; account: { type: string; provider: string }; profile?: Row }) => Promise<void>
const credentials = authConfig.providers.find((provider) => typeof provider !== 'function' && provider.id === 'credentials') as unknown as {
  options: { authorize: (credentials: Row) => Promise<Row | null> }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.account = { id: 'creator-id', email: 'creator@example.test', name: 'Chosen name', role: 'tester', status: 'pending', emailVerified: null, authVersion: 0, passwordHash: 'bcrypt-hash' }
  mocks.getProfile.mockResolvedValue({ role: 'tester', status: 'active', name: 'Chosen name', image: null, authVersion: 0 })
  mocks.rateLimit.mockResolvedValue({ ok: true })
  mocks.compare.mockResolvedValue(true)
  mocks.open.mockReturnValue(false)
})

describe('Google identity boundary', () => {
  it('requires a verified email claim, including when the claim is absent or a string', async () => {
    for (const profile of [{}, { email_verified: false }, { email_verified: 'true' }]) {
      await expect(callbacks.signIn({ account: { provider: 'google' }, profile })).resolves.toBe(false)
    }
    await expect(callbacks.signIn({ account: { provider: 'google' }, profile: { email_verified: true } })).resolves.toBe(true)
    await expect(callbacks.signIn({ account: { provider: 'credentials' } })).resolves.toBe(true)
  })

  it('does not enable automatic linking to an unverified password account', () => {
    const providers = authConfig.providers.map((provider) => typeof provider === 'function' ? provider() : provider)
    const google = providers.find((provider) => provider.id === 'google') as unknown as { allowDangerousEmailAccountLinking?: boolean; options?: { allowDangerousEmailAccountLinking?: boolean } }
    expect(google).toBeDefined()
    expect(google.allowDangerousEmailAccountLinking).not.toBe(true)
    expect(google.options?.allowDangerousEmailAccountLinking).not.toBe(true)
  })

  it.each(['pending', 'suspended', 'active'])('preserves %s access unless a pending creator is eligible for open signup', async (status) => {
    mocks.account.status = status
    mocks.open.mockReturnValue(true)
    await signedIn({ user: { id: 'creator-id' }, account: { type: 'oidc', provider: 'google' }, profile: { email_verified: true, name: 'Provider name' } })
    expect(mocks.account.status).toBe(status === 'pending' ? 'active' : status)
    expect(mocks.account.name).toBe('Chosen name')
    expect(mocks.account.emailVerified).toBeInstanceOf(Date)
  })

  it('keeps approved-only signup pending and does not activate an unverified password account', async () => {
    await signedIn({ user: { id: 'creator-id' }, account: { type: 'oidc', provider: 'google' }, profile: { email_verified: true } })
    expect(mocks.account.status).toBe('pending')
    mocks.account.emailVerified = null
    mocks.open.mockReturnValue(true)
    await signedIn({ user: { id: 'creator-id' }, account: { type: 'credentials', provider: 'credentials' } })
    expect(mocks.account.status).toBe('pending')
    expect(mocks.invite).toHaveBeenCalledWith('creator-id')
  })
})

describe('password recovery session revocation', () => {
  it('captures credentials version and reads the current version for an adapter user', async () => {
    await expect(callbacks.jwt({ token: {}, user: { id: 'creator-id', authVersion: 3 } })).resolves.toMatchObject({ uid: 'creator-id', authVersion: 3 })
    mocks.account.authVersion = 4
    await expect(callbacks.jwt({ token: {}, user: { id: 'creator-id' } })).resolves.toMatchObject({ uid: 'creator-id', authVersion: 4 })
  })

  it('preserves the issued version during token refresh instead of reviving a revoked session', async () => {
    mocks.account.authVersion = 5
    await expect(callbacks.jwt({ token: { uid: 'creator-id', authVersion: 1 } })).resolves.toEqual({ uid: 'creator-id', authVersion: 1 })
  })

  it('invalidates a session whose version predates recovery', async () => {
    mocks.getProfile.mockResolvedValue({ role: 'tester', status: 'active', name: null, image: null, authVersion: 1 })
    const result = await callbacks.session({ session: { user: {} }, token: { uid: 'creator-id', authVersion: 0 } })
    expect(result.user).toMatchObject({ id: '', status: 'revoked' })
  })

  it('allows legacy versionless tokens only while the account remains at version zero', async () => {
    const token = { uid: 'creator-id' }
    expect((await callbacks.session({ session: { user: {} }, token })).user.id).toBe('creator-id')
    mocks.getProfile.mockResolvedValue({ role: 'tester', status: 'active', authVersion: 1 })
    expect((await callbacks.session({ session: { user: {} }, token })).user.id).toBe('')
  })

  it.each(['missing', 'unavailable'])('does not grant active access when account lookup is %s', async (profile) => {
    mocks.getProfile.mockResolvedValue(profile)
    const result = await callbacks.session({ session: { user: {} }, token: { uid: 'creator-id', authVersion: 0 } })
    expect(result.user.status).not.toBe('active')
    if (profile === 'missing') expect(result.user.id).toBe('')
    else expect(result.user.status).toBe('unavailable')
  })
})

describe('password sign-in boundary', () => {
  it('checks the rate limit before expensive password comparison', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false })
    await expect(credentials.options.authorize({ email: ' Creator@Example.Test ', password: 'new-password' })).resolves.toBeNull()
    expect(mocks.rateLimit).toHaveBeenCalledWith('signin:email:creator@example.test', 8, 15 * 60 * 1000)
    expect(mocks.compare).not.toHaveBeenCalled()
  })

  it('rejects wrong input types and oversized credentials before password comparison', async () => {
    await expect(credentials.options.authorize({ email: { value: 'creator@example.test' }, password: 'new-password' })).resolves.toBeNull()
    await expect(credentials.options.authorize({ email: 'creator@example.test', password: 'a'.repeat(201) })).resolves.toBeNull()
    expect(mocks.compare).not.toHaveBeenCalled()
  })

  it('preserves existing long passwords at sign-in while new and reset passwords use stricter validation', async () => {
    await expect(credentials.options.authorize({ email: 'creator@example.test', password: 'é'.repeat(37) })).resolves.toMatchObject({ id: 'creator-id' })
    expect(mocks.compare).toHaveBeenCalledWith('é'.repeat(37), 'bcrypt-hash')
  })

  it('returns the account session version only after its password is verified', async () => {
    mocks.account.authVersion = 3
    const input = { email: 'creator@example.test', password: 'new-password' }
    mocks.compare.mockResolvedValue(false)
    await expect(credentials.options.authorize(input)).resolves.toBeNull()
    mocks.compare.mockResolvedValue(true)
    const result = await credentials.options.authorize(input)
    expect(result).toMatchObject({ id: 'creator-id', authVersion: 3 })
    expect(result).not.toHaveProperty('passwordHash')
  })
})
