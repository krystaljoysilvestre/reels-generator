import { DEFAULT_USER_LIMITS } from '@reels/core'
import type { UserUsage } from '@reels/db'

/** Keep the account display on the same caps and UTC calendar windows as the spend gates. */
export function accountUsage(usage: UserUsage, now = new Date()) {
  const exempt = usage.role === 'admin'
  const monthlyLimit = exempt ? null : usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents
  const dailyLimit = exempt ? null : usage.dailyReelQuota ?? DEFAULT_USER_LIMITS.dailyReelQuota
  return {
    monthlyLimit,
    dailyLimit,
    monthlyRemaining: monthlyLimit === null ? null : Math.max(0, monthlyLimit - usage.spendCentsThisMonth),
    dailyRemaining: dailyLimit === null ? null : Math.max(0, dailyLimit - usage.reelsToday),
    monthlyReset: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    dailyReset: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)),
  }
}
