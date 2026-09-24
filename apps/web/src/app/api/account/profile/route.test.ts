import { NextResponse, type NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  gate: vi.fn(), limit: vi.fn(), update: vi.fn(), set: vi.fn(), where: vi.fn(), returning: vi.fn(), invalidate: vi.fn(),
}))
vi.mock('@/lib/api-access', () => ({ requireApiUser: mocks.gate }))
vi.mock('@/lib/user-profile', () => ({ invalidateUserProfile: mocks.invalidate }))
vi.mock('@reels/providers', () => ({ checkRateLimit: mocks.limit }))
vi.mock('@reels/db', () => ({ users: { id: 'user-id', name: 'user-name' }, getDb: () => ({ update: mocks.update }) }))
vi.mock('drizzle-orm', () => ({ eq: (column: unknown, value: unknown) => ({ column, value }) }))

import { PATCH } from './route'

const request = (body: unknown) => ({ json: async () => body }) as NextRequest

describe('account profile updates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.gate.mockResolvedValue({ id: 'signed-in-user', role: 'tester', status: 'active' })
    mocks.limit.mockResolvedValue({ ok: true })
    mocks.update.mockReturnValue({ set: mocks.set })
    mocks.set.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ returning: mocks.returning })
    mocks.returning.mockResolvedValue([{ name: 'Avery' }])
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([401, 403, 503])('passes the account gate response through before reading input (%s)', async (status) => {
    mocks.gate.mockResolvedValue(NextResponse.json({ error: 'Not available' }, { status }))
    const json = vi.fn()
    expect((await PATCH({ json } as unknown as NextRequest)).status).toBe(status)
    expect(json).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it.each([null, {}, { name: '   ' }, { name: 'x'.repeat(81) }, { name: 'Avery', id: 'someone-else' }, { name: 'Avery', role: 'admin' }, { name: 'Avery', status: 'active' }])('rejects invalid fields without a write: %j', async (body) => {
    expect((await PATCH(request(body))).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('treats malformed JSON as invalid input', async () => {
    const response = await PATCH({ json: async () => { throw new Error('bad JSON') } } as unknown as NextRequest)
    expect(response.status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('updates only the caller and refreshes their cached identity', async () => {
    const response = await PATCH(request({ name: '  Avery  ' }))
    expect(response.status).toBe(200)
    expect(mocks.set).toHaveBeenCalledWith({ name: 'Avery' })
    expect(mocks.where).toHaveBeenCalledWith({ column: 'user-id', value: 'signed-in-user' })
    expect(mocks.limit).toHaveBeenCalledWith('account:profile:signed-in-user', 30, 3_600_000)
    expect(mocks.invalidate).toHaveBeenCalledWith('signed-in-user')
    expect(console.log).toHaveBeenCalledWith('[audit] account.profile.updated', expect.objectContaining({ actor: 'signed-in-user', at: expect.any(String) }))
    await expect(response.json()).resolves.toEqual({ name: 'Avery' })
  })

  it('does not grant admins a way to edit another account here', async () => {
    mocks.gate.mockResolvedValue({ id: 'admin-user', role: 'admin', status: 'active' })
    expect((await PATCH(request({ name: 'Avery' }))).status).toBe(200)
    expect(mocks.where).toHaveBeenCalledWith({ column: 'user-id', value: 'admin-user' })
  })

  it('honors the update rate limit', async () => {
    mocks.limit.mockResolvedValue({ ok: false, retryAfterSec: 45 })
    const response = await PATCH(request({ name: 'Avery' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('45')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('does not report a deleted account as saved', async () => {
    mocks.returning.mockResolvedValue([])
    expect((await PATCH(request({ name: 'Avery' }))).status).toBe(404)
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })

  it('returns a generic failure and retains the previous cached profile after a failed write', async () => {
    mocks.returning.mockRejectedValue(new Error('private database details'))
    const response = await PATCH(request({ name: 'Avery' }))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('database')
    expect(mocks.invalidate).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalled()
  })
})
