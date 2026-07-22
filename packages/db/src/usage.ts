import { and, count, eq, gte, sum } from 'drizzle-orm'
import { getDb } from './client.js'
import { users, channels, reels, compilations } from './schema.js'

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
  // Compilations spend money too (connective-tissue LLM + TTS) and bill to the same wallet — include
  // them so the monthly budget can't be under-counted by the compilation path.
  const [compSpend] = await db
    .select({ cents: sum(compilations.costCents) })
    .from(compilations)
    .innerJoin(channels, eq(compilations.channelId, channels.id))
    .where(and(eq(channels.userId, userId), gte(compilations.createdAt, monthStart)))
  const [cnt] = await db
    .select({ n: count() })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(and(eq(channels.userId, userId), gte(reels.createdAt, dayStart)))

  return {
    role: u.role,
    monthlyBudgetCents: u.monthlyBudgetCents,
    dailyReelQuota: u.dailyReelQuota,
    spendCentsThisMonth: Number(spend?.cents ?? 0) + Number(compSpend?.cents ?? 0),
    reelsToday: Number(cnt?.n ?? 0),
  }
}

// The reel owner's role + monthly cap + month-to-date spend — feeds the harness's mid-pipeline per-user
// budget re-check (assertUserBudget). Returns null when the reel has no owner (legacy owner-less channel),
// so the harness simply skips the per-user check for those.
export async function getReelOwnerUsage(
  reelId: string,
): Promise<{ userId: string; role: string; monthlyBudgetCents: number | null; spendCentsThisMonth: number } | null> {
  const db = getDb()
  const owner = await db
    .select({ userId: channels.userId, role: users.role, monthlyBudgetCents: users.monthlyBudgetCents })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .innerJoin(users, eq(channels.userId, users.id))
    .where(eq(reels.id, reelId))
    .then((r) => r[0])
  if (!owner?.userId) return null

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [spend] = await db
    .select({ cents: sum(reels.costCents) })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(and(eq(channels.userId, owner.userId), gte(reels.createdAt, monthStart)))
  // Include the owner's compilation spend so the mid-pipeline budget re-check sees their full month-to-date.
  const [compSpend] = await db
    .select({ cents: sum(compilations.costCents) })
    .from(compilations)
    .innerJoin(channels, eq(compilations.channelId, channels.id))
    .where(and(eq(channels.userId, owner.userId), gte(compilations.createdAt, monthStart)))

  return {
    userId: owner.userId,
    role: owner.role,
    monthlyBudgetCents: owner.monthlyBudgetCents,
    spendCentsThisMonth: Number(spend?.cents ?? 0) + Number(compSpend?.cents ?? 0),
  }
}

// App-wide spend today, across every tenant — feeds the global daily kill-switch (assertGlobalDailyBudget).
// Approximated by reels CREATED today (we have no per-charge ledger; cost accrues on the reel row shortly
// after creation), matching the createdAt-window convention getUserUsage uses for the monthly figure.
export async function getGlobalSpendTodayCents(): Promise<number> {
  const db = getDb()
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const [row] = await db
    .select({ cents: sum(reels.costCents) })
    .from(reels)
    .where(gte(reels.createdAt, dayStart))
  // Compilations bill to the same app-wide wallet — count them so the kill-switch sees true daily spend.
  const [compRow] = await db
    .select({ cents: sum(compilations.costCents) })
    .from(compilations)
    .where(gte(compilations.createdAt, dayStart))
  return Number(row?.cents ?? 0) + Number(compRow?.cents ?? 0)
}
