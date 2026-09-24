import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ProfileModule from './user-profile'

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock('@reels/db', () => ({
  users: { id: 'id', role: 'role', status: 'status', name: 'name', image: 'image', authVersion: 'authVersion' },
  getDb: () => ({ select: () => ({ from: () => ({ where: mocks.read }) }) }),
}))
let profiles: typeof ProfileModule
const ACTIVE = { role: 'tester', status: 'active', name: 'Creator', image: null, authVersion: 0 }

beforeEach(async () => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.read.mockResolvedValue([ACTIVE])
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  profiles = await import('./user-profile')
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('authorization profile cache', () => {
  it('uses its bounded cache then reads a changed suspension/version after expiry', async () => {
    await expect(profiles.getUserProfile('creator')).resolves.toEqual(ACTIVE)
    mocks.read.mockResolvedValue([{ ...ACTIVE, status: 'suspended', authVersion: 1 }])
    await expect(profiles.getUserProfile('creator')).resolves.toEqual(ACTIVE)
    expect(mocks.read).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(30_001)
    await expect(profiles.getUserProfile('creator')).resolves.toMatchObject({ status: 'suspended', authVersion: 1 })
  })

  it('never reuses expired authorization when the database is unavailable', async () => {
    await profiles.getUserProfile('creator')
    mocks.read.mockRejectedValue(new Error('database unavailable'))
    vi.advanceTimersByTime(30_001)
    await expect(profiles.getUserProfile('creator')).resolves.toBe(profiles.ACCOUNT_UNAVAILABLE)
    vi.advanceTimersByTime(30_001)
    await expect(profiles.getUserProfile('creator')).resolves.toBe(profiles.ACCOUNT_UNAVAILABLE)
  })

  it('invalidates locally on recovery instead of waiting for the TTL', async () => {
    await profiles.getUserProfile('creator')
    mocks.read.mockResolvedValue([{ ...ACTIVE, authVersion: 1 }])
    profiles.invalidateUserProfile('creator')
    await expect(profiles.getUserProfile('creator')).resolves.toMatchObject({ authVersion: 1 })
  })

  it('removes deleted accounts from cache and reports a fresh outage as unavailable', async () => {
    await profiles.getUserProfile('creator')
    vi.advanceTimersByTime(30_001)
    mocks.read.mockResolvedValue([])
    await expect(profiles.getUserProfile('creator')).resolves.toBe('missing')
    mocks.read.mockRejectedValue(new Error('database unavailable'))
    await expect(profiles.getUserProfile('creator')).resolves.toBe(profiles.ACCOUNT_UNAVAILABLE)
  })
})
