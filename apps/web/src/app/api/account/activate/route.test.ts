import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: vi.fn(), open: vi.fn(), read: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn(), invalidate: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ getCurrentUser: mocks.user }))
vi.mock('@/lib/signup-policy', () => ({ isOpenSignup: mocks.open }))
vi.mock('@/lib/user-profile', () => ({ ACCOUNT_UNAVAILABLE: 'unavailable', invalidateUserProfile: mocks.invalidate }))
vi.mock('@reels/db', () => ({
  users: { id: 'account-id', status: 'account-status', emailVerified: 'account-verified' },
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.read }) }), update: mocks.update }),
}))
vi.mock('drizzle-orm', () => ({
  eq: (column: unknown, value: unknown) => ({ column, value }),
  isNotNull: (column: unknown) => ({ notNull: column }),
  and: (...conditions: unknown[]) => conditions,
}))

import { POST } from './route'

const request = (body: unknown = {}) => new Request('https://app.example.test/api/account/activate', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const verified = new Date('2026-09-23T00:00:00Z')

describe('entering open access from a verified waiting account', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.user.mockResolvedValue({ id: 'signed-in-user', role: 'tester', status: 'pending' })
    mocks.open.mockReturnValue(true)
    mocks.read.mockResolvedValue([{ status: 'pending', emailVerified: verified }])
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ returning: mocks.returning })
    mocks.returning.mockResolvedValue([{ id: 'signed-in-user' }])
  })
  afterEach(() => vi.restoreAllMocks())

  it('activates only the authenticated verified pending account while signup is open', async () => {
    const response = await POST(request())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.read).toHaveBeenCalledWith({ column: 'account-id', value: 'signed-in-user' })
    expect(mocks.set).toHaveBeenCalledWith({ status: 'active' })
    expect(mocks.where).toHaveBeenCalledWith([
      { column: 'account-id', value: 'signed-in-user' },
      { column: 'account-status', value: 'pending' },
      { notNull: 'account-verified' },
    ])
    expect(mocks.invalidate).toHaveBeenCalledWith('signed-in-user')
    expect(console.log).toHaveBeenCalledWith('[audit] early_access_activated actor=signed-in-user target=signed-in-user')
  })

  it('does not activate while access still requires approval', async () => {
    mocks.open.mockReturnValue(false)
    expect((await POST(request())).status).toBe(403)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([
    { status: 'pending', emailVerified: null },
    { status: 'suspended', emailVerified: verified },
    { status: 'unexpected', emailVerified: verified },
  ])('does not activate a $status account without fresh eligibility', async (account) => {
    mocks.read.mockResolvedValue([account])
    expect((await POST(request())).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('does not revive a missing account', async () => {
    mocks.read.mockResolvedValue([])
    expect((await POST(request())).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([{ id: 'another-user' }, { status: 'active' }, { role: 'admin' }, null])('rejects supplied account fields: %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('requires a signed-in caller', async () => {
    mocks.user.mockResolvedValue(null)
    expect((await POST(request())).status).toBe(401)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('treats an already-active verified account as completed without changing its role or status', async () => {
    mocks.user.mockResolvedValue({ id: 'signed-in-user', role: 'admin', status: 'active' })
    mocks.read.mockResolvedValue([{ status: 'active', emailVerified: verified }])
    expect((await POST(request())).status).toBe(200)
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalledWith('signed-in-user')
  })

  it('accepts another tab completing activation concurrently', async () => {
    mocks.returning.mockResolvedValue([])
    mocks.read.mockResolvedValueOnce([{ status: 'pending', emailVerified: verified }])
      .mockResolvedValueOnce([{ status: 'active', emailVerified: verified }])
    expect((await POST(request())).status).toBe(200)
    expect(mocks.invalidate).toHaveBeenCalledWith('signed-in-user')
    expect(console.log).not.toHaveBeenCalled()
  })

  it('does not override a suspension that wins the concurrent update', async () => {
    mocks.returning.mockResolvedValue([])
    mocks.read.mockResolvedValueOnce([{ status: 'pending', emailVerified: verified }])
      .mockResolvedValueOnce([{ status: 'suspended', emailVerified: verified }])
    expect((await POST(request())).status).toBe(403)
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('fails closed while authorization is unavailable', async () => {
    mocks.user.mockResolvedValue({ id: 'signed-in-user', status: 'unavailable' })
    expect((await POST(request())).status).toBe(503)
    expect(mocks.read).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
