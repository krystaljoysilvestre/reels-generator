import { and, count, eq, gte, sum } from 'drizzle-orm'
import { getDb } from './client.js'
import { users, channels, reels } from './schema.js'

// A user's current usage + their effective caps (null caps → caller applies the global default).
// Usage is summed/counted across all channels the user owns (reels inherit ownership via channelId).
export type UserUsage = {
  role: string
  monthlyBudgetCents: number | null
  dailyReelQuota: number | null
  spendCentsThisMonth: number
  reelsToday: number
}

export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  const db = getDb()
  const u = await db
    .select({ role: users.role, monthlyBudgetCents: users.monthlyBudgetCents, dailyReelQuota: users.dailyReelQuota })
    .from(users)
    .where(eq(users.id, userId))
    .then((r) => r[0])
  if (!u) return null

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const [spend] = await db
    .select({ cents: sum(reels.costCents) })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(and(eq(channels.userId, userId), gte(reels.createdAt, monthStart)))
  const [cnt] = await db
    .select({ n: count() })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(and(eq(channels.userId, userId), gte(reels.createdAt, dayStart)))

  return {
    role: u.role,
    monthlyBudgetCents: u.monthlyBudgetCents,
    dailyReelQuota: u.dailyReelQuota,
    spendCentsThisMonth: Number(spend?.cents ?? 0),
    reelsToday: Number(cnt?.n ?? 0),
  }
}
