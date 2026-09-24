import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as NextServer from 'next/server'
import type * as AccountTokens from '@/lib/account-tokens'

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(), rateLimit: vi.fn(), configured: vi.fn(), sendEmail: vi.fn(), issue: vi.fn(), verify: vi.fn(), reset: vi.fn(),
  lookup: vi.fn(), after: vi.fn(),
}))
vi.mock('next/server', async (importOriginal) => ({ ...await importOriginal<typeof NextServer>(), after: mocks.after }))
vi.mock('@reels/providers', () => ({ checkRateLimit: mocks.rateLimit }))
vi.mock('@reels/db', () => ({
  users: { id: 'id', email: 'email', emailVerified: 'emailVerified', status: 'status', passwordHash: 'passwordHash' },
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.lookup }) }) }),
}))
vi.mock('drizzle-orm', () => ({ eq: (field: string, value: unknown) => ({ field, value }) }))
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.currentUser }))
vi.mock('@/lib/account-email', () => ({ isAccountEmailConfigured: mocks.configured, sendAccountEmail: mocks.sendEmail }))
vi.mock('@/lib/account-tokens', async (importOriginal) => ({
  ...await importOriginal<typeof AccountTokens>(),
  issueAccountToken: mocks.issue, verifyAccountEmail: mocks.verify, resetAccountPassword: mocks.reset,
}))

import { POST as requestVerification } from './request-verification/route'
import { POST as verifyEmail } from './verify-email/route'
import { POST as forgotPassword } from './forgot-password/route'
import { POST as resetPassword } from './reset-password/route'

const USER_ID = '7ab34d6f-008a-4431-aa45-6919cfcf6879'
const TOKEN = `${USER_ID}.${'a'.repeat(64)}`
const request = (body: unknown) => new Request('https://studio.example.test/api/account/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.1' }, body: JSON.stringify(body),
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.currentUser.mockResolvedValue({ id: USER_ID, email: 'creator@example.test', status: 'pending' })
  mocks.lookup.mockResolvedValue([{ id: USER_ID, email: 'creator@example.test', status: 'pending', emailVerified: null, passwordHash: 'existing-hash' }])
  mocks.rateLimit.mockResolvedValue({ ok: true, retryAfterSec: 0 })
  mocks.configured.mockReturnValue(true)
  mocks.issue.mockResolvedValue(TOKEN)
  mocks.sendEmail.mockResolvedValue(undefined)
  mocks.verify.mockResolvedValue(true)
  mocks.reset.mockResolvedValue(true)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('authenticated verification request', () => {
  it('lets pending users verify only their own account and never returns the bearer token', async () => {
    const response = await requestVerification(request({}))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.lookup).toHaveBeenCalledWith({ field: 'id', value: USER_ID })
    expect(mocks.issue).toHaveBeenCalledWith(USER_ID, 'verify')
    expect(mocks.sendEmail).toHaveBeenCalledWith('creator@example.test', 'verify', TOKEN)
  })

  it.each([null, { id: USER_ID, status: 'suspended' }])('rejects unavailable sessions before any email is issued', async (user) => {
    mocks.currentUser.mockResolvedValue(user)
    const response = await requestVerification(request({}))
    expect(response.status).toBe(user ? 403 : 401)
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied account identity', async () => {
    const response = await requestVerification(request({ userId: 'another-user' }))
    expect(response.status).toBe(400)
    expect(mocks.issue).not.toHaveBeenCalled()
  })

  it('does not send email to an account suspended since the session lookup', async () => {
    mocks.lookup.mockResolvedValue([{ id: USER_ID, email: 'creator@example.test', status: 'suspended' }])
    expect((await requestVerification(request({}))).status).toBe(403)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('reports unavailable mail configuration explicitly', async () => {
    mocks.configured.mockReturnValue(false)
    expect((await requestVerification(request({}))).status).toBe(503)
    expect(mocks.issue).not.toHaveBeenCalled()
  })
})

describe('public password recovery request', () => {
  it.each([true, false])('returns the same response before looking up an account (exists=%s)', async (exists) => {
    mocks.lookup.mockResolvedValue(exists ? [{ id: USER_ID, email: 'creator@example.test', passwordHash: 'hash' }] : [])
    const response = await forgotPassword(request({ email: ' Creator@Example.Test ' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.lookup).not.toHaveBeenCalled()
    await mocks.after.mock.calls[0][0]()
    expect(mocks.lookup).toHaveBeenCalledWith({ field: 'email', value: 'creator@example.test' })
    expect(mocks.sendEmail).toHaveBeenCalledTimes(exists ? 1 : 0)
    if (exists) expect(mocks.sendEmail).toHaveBeenCalledWith('creator@example.test', 'reset', TOKEN)
  })

  it('preserves the generic success response when delivery later fails', async () => {
    mocks.sendEmail.mockRejectedValue(new Error(`provider exposed ${TOKEN}`))
    const response = await forgotPassword(request({ email: 'creator@example.test' }))
    await mocks.after.mock.calls[0][0]()
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(console.error).toHaveBeenCalledWith('[account] Password recovery email request failed.')
  })

  it('keeps Google-only recovery on Google and never tells the caller which provider is used', async () => {
    mocks.lookup.mockResolvedValue([{ id: USER_ID, email: 'creator@example.test', passwordHash: null }])
    const response = await forgotPassword(request({ email: 'creator@example.test' }))
    await mocks.after.mock.calls[0][0]()
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('reports missing configuration independently of whether the account exists', async () => {
    mocks.configured.mockReturnValue(false)
    expect((await forgotPassword(request({ email: 'creator@example.test' }))).status).toBe(503)
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
  })
})

describe('public link redemption', () => {
  it('accepts the verification token only from a validated request body', async () => {
    const response = await verifyEmail(request({ token: TOKEN }))
    expect(response.status).toBe(200)
    expect(mocks.verify).toHaveBeenCalledWith(TOKEN)
    expect((await verifyEmail(request({ token: 'invalid' }))).status).toBe(400)
    expect(mocks.verify).toHaveBeenCalledTimes(1)
  })

  it('rejects consumed or expired tokens', async () => {
    mocks.verify.mockResolvedValue(false)
    mocks.reset.mockResolvedValue(false)
    expect((await verifyEmail(request({ token: TOKEN }))).status).toBe(400)
    expect((await resetPassword(request({ token: TOKEN, password: 'new-password' }))).status).toBe(400)
  })

  it('resets a password without signing in or returning secrets', async () => {
    const response = await resetPassword(request({ token: TOKEN, password: 'new-password' }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.reset).toHaveBeenCalledWith(TOKEN, 'new-password')
    expect(mocks.currentUser).not.toHaveBeenCalled()
  })

  it('rejects passwords beyond the bcrypt byte limit', async () => {
    expect((await resetPassword(request({ token: TOKEN, password: 'é'.repeat(37) }))).status).toBe(400)
    expect(mocks.reset).not.toHaveBeenCalled()
  })

  it.each([requestVerification, verifyEmail, forgotPassword, resetPassword])('limits attempts before issuing or consuming a token', async (handler) => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSec: 120 })
    const body = handler === requestVerification ? {} : { token: TOKEN, password: 'new-password', email: 'creator@example.test' }
    const response = await handler(request(body))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('120')
    expect(mocks.issue).not.toHaveBeenCalled()
    expect(mocks.reset).not.toHaveBeenCalled()
    expect(mocks.verify).not.toHaveBeenCalled()
  })
})
