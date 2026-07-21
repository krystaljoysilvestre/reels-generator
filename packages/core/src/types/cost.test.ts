import { describe, it, expect } from 'vitest'
import { checkUserLimits } from './cost.js'

const LIMITS = { monthlyBudgetCents: 5000, dailyReelQuota: 20 }

describe('checkUserLimits', () => {
  it('allows a user under both caps', () => {
    expect(checkUserLimits({ spendCentsThisMonth: 1000, reelsToday: 5 }, LIMITS)).toEqual({ ok: true })
  })

  it('blocks at the daily reel quota', () => {
    const res = checkUserLimits({ spendCentsThisMonth: 0, reelsToday: 20 }, LIMITS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/daily/i)
  })

  it('blocks at the monthly budget', () => {
    const res = checkUserLimits({ spendCentsThisMonth: 5000, reelsToday: 0 }, LIMITS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/monthly|budget/i)
  })

  it('checks the daily quota before the monthly budget', () => {
    const res = checkUserLimits({ spendCentsThisMonth: 9999, reelsToday: 20 }, LIMITS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/daily/i)
  })
})
