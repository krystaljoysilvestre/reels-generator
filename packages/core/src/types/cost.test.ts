import { describe, it, expect } from 'vitest'
import {
  assertBudget,
  BudgetExceededError,
  checkUserLimits,
  budgetCapForSeconds,
  DEFAULT_BUDGET_CAPS_CENTS,
  BUDGET_CAP_MAX_CENTS,
} from './cost.js'

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

describe('budgetCapForSeconds', () => {
  it('falls back to the 75s default when the length is unknown', () => {
    const expected = budgetCapForSeconds(75)
    expect(budgetCapForSeconds(null)).toBe(expected)
    expect(budgetCapForSeconds(undefined)).toBe(expected)
    expect(budgetCapForSeconds(0)).toBe(expected)
  })

  it('clears the real cost of the 85s all-animated reel that stranded under the flat $8 cap', () => {
    // 2026-07-24 production run: the reel reached $7.60 and died one scene short of finishing.
    expect(budgetCapForSeconds(85)).toBeGreaterThan(760)
    expect(budgetCapForSeconds(85)).toBeGreaterThan(DEFAULT_BUDGET_CAPS_CENTS.short)
  })

  it('never drops below the legacy flat floor, however short the reel', () => {
    expect(budgetCapForSeconds(5)).toBe(DEFAULT_BUDGET_CAPS_CENTS.short)
  })

  it('stays a bounded backstop for absurd lengths', () => {
    expect(budgetCapForSeconds(100_000)).toBe(BUDGET_CAP_MAX_CENTS)
  })

  it('grows with length', () => {
    expect(budgetCapForSeconds(180)).toBeGreaterThan(budgetCapForSeconds(75))
  })
})

describe('assertBudget', () => {
  it('halts before another paid call when the reel is exactly at its cap', () => {
    expect(() => assertBudget('reel-1', 800, 800)).toThrow(BudgetExceededError)
  })

  it('allows the next paid step while budget remains', () => {
    expect(() => assertBudget('reel-1', 799, 800)).not.toThrow()
  })
})
