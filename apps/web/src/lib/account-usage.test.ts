import { describe, expect, it } from 'vitest'
import { DEFAULT_USER_LIMITS } from '@reels/core'
import type { UserUsage } from '@reels/db'
import { accountUsage } from './account-usage'

const usage: UserUsage = { role: 'tester', status: 'active', monthlyBudgetCents: null, dailyReelQuota: null, spendCentsThisMonth: 100, reelsToday: 1 }

describe('account allowance display', () => {
  it('uses the same default limits as production', () => {
    const result = accountUsage(usage)
    expect(result.monthlyLimit).toBe(DEFAULT_USER_LIMITS.monthlyBudgetCents)
    expect(result.dailyLimit).toBe(DEFAULT_USER_LIMITS.dailyReelQuota)
  })

  it('honors zero and custom overrides without showing negative remaining allowance', () => {
    const result = accountUsage({ ...usage, monthlyBudgetCents: 0, dailyReelQuota: 0 })
    expect(result.monthlyLimit).toBe(0)
    expect(result.dailyLimit).toBe(0)
    expect(result.monthlyRemaining).toBe(0)
    expect(result.dailyRemaining).toBe(0)
    expect(accountUsage({ ...usage, monthlyBudgetCents: 250, dailyReelQuota: 4 })).toMatchObject({ monthlyRemaining: 150, dailyRemaining: 3 })
  })

  it('matches the production exemption for admin accounts', () => {
    expect(accountUsage({ ...usage, role: 'admin', monthlyBudgetCents: 0, dailyReelQuota: 0 })).toMatchObject({
      monthlyLimit: null, dailyLimit: null, monthlyRemaining: null, dailyRemaining: null,
    })
  })

  it.each([
    ['2026-12-31T23:59:59.000Z', '2027-01-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'],
    ['2028-02-28T18:00:00.000Z', '2028-02-29T00:00:00.000Z', '2028-03-01T00:00:00.000Z'],
    ['2026-09-24T02:00:00+08:00', '2026-09-24T00:00:00.000Z', '2026-10-01T00:00:00.000Z'],
  ])('uses UTC calendar boundaries at %s', (now, day, month) => {
    const result = accountUsage(usage, new Date(now))
    expect(result.dailyReset.toISOString()).toBe(day)
    expect(result.monthlyReset.toISOString()).toBe(month)
  })
})
