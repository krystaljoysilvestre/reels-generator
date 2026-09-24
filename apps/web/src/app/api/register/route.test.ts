import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AccountTokens from '@/lib/account-tokens'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), insert: vi.fn(), values: vi.fn(), hash: vi.fn(), rateLimit: vi.fn(), invite: vi.fn(), configured: vi.fn(), issue: vi.fn(), send: vi.fn() }))
vi.mock('@reels/db', () => ({
  users: { id: 'id', email: 'email' },
  getDb: () => ({
    select: () => ({ from: () => ({ where: mocks.lookup }) }),
    insert: () => ({ values: (values: unknown) => { mocks.values(values); return { returning: mocks.insert } } }),
  }),
}))
vi.mock('bcryptjs', () => ({ default: { hash: mocks.hash } }))
vi.mock('@reels/providers', () => ({ checkRateLimit: mocks.rateLimit }))
vi.mock('@/lib/invite', () => ({ consumeInviteForUser: mocks.invite }))
vi.mock('@/lib/account-email', () => ({ isAccountEmailConfigured: mocks.configured, sendAccountEmail: mocks.send }))
vi.mock('@/lib/account-tokens', async (importOriginal) => ({ ...await importOriginal<typeof AccountTokens>(), issueAccountToken: mocks.issue }))

import { POST } from './route'

const request = (extra: Record<string, unknown> = {}) => new NextRequest('https://studio.example.test/api/register', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: ' Creator ', email: ' Creator@Example.Test ', password: 'new-password', ...extra }),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SIGNUP_MODE', 'approval')
  mocks.lookup.mockResolvedValue([])
  mocks.insert.mockResolvedValue([{ id: 'creator-id' }])
  mocks.hash.mockResolvedValue('bcrypt-hash')
  mocks.rateLimit.mockResolvedValue({ ok: true, retryAfterSec: 0 })
  mocks.configured.mockReturnValue(false)
  mocks.issue.mockResolvedValue('private-token')
  mocks.send.mockResolvedValue(undefined)
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('registration security and activation', () => {
  it('keeps approval-mode registration available and persists only normalized identity and a password hash', async () => {
    const response = await POST(request({ status: 'active', role: 'admin', emailVerified: true }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, verificationSent: false })
    expect(mocks.values).toHaveBeenCalledWith({ name: 'Creator', email: 'creator@example.test', passwordHash: 'bcrypt-hash' })
    expect(mocks.invite).toHaveBeenCalledWith('creator-id')
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('blocks open email registration before creating accounts when verification mail is unconfigured', async () => {
    vi.stubEnv('SIGNUP_MODE', 'open')
    expect((await POST(request())).status).toBe(503)
    expect(mocks.lookup).not.toHaveBeenCalled()
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.values).not.toHaveBeenCalled()
  })

  it('creates a pending account and sends verification when open email signup is configured', async () => {
    vi.stubEnv('SIGNUP_MODE', 'open')
    mocks.configured.mockReturnValue(true)
    const response = await POST(request())
    await expect(response.json()).resolves.toEqual({ ok: true, verificationSent: true })
    expect(mocks.values.mock.calls[0][0]).not.toHaveProperty('status')
    expect(mocks.values.mock.calls[0][0]).not.toHaveProperty('emailVerified')
    expect(mocks.issue).toHaveBeenCalledWith('creator-id', 'verify')
    expect(mocks.send).toHaveBeenCalledWith('creator@example.test', 'verify', 'private-token')
  })

  it('keeps a successfully created account recoverable when email delivery fails without exposing the token', async () => {
    mocks.configured.mockReturnValue(true)
    mocks.send.mockRejectedValue(new Error('provider includes private-token'))
    const response = await POST(request())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, verificationSent: false })
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('private-token')
  })

  it('rejects too-long UTF-8 passwords before hashing or persistence', async () => {
    expect((await POST(request({ password: 'é'.repeat(37) }))).status).toBe(400)
    expect(mocks.hash).not.toHaveBeenCalled()
    expect(mocks.values).not.toHaveBeenCalled()
  })

  it('does not replace an existing account, and handles the concurrent email insert race', async () => {
    mocks.lookup.mockResolvedValue([{ id: 'existing-id' }])
    expect((await POST(request())).status).toBe(409)
    expect(mocks.values).not.toHaveBeenCalled()
    mocks.lookup.mockResolvedValue([])
    mocks.insert.mockRejectedValue({ code: '23505' })
    expect((await POST(request())).status).toBe(409)
    expect(mocks.invite).not.toHaveBeenCalled()
  })

  it('applies signup throttling before expensive password hashing', async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfterSec: 90 })
    const response = await POST(request())
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('90')
    expect(mocks.hash).not.toHaveBeenCalled()
  })
})
