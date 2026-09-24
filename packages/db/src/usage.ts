import { and, count, eq, gte, isNull, like, sum } from 'drizzle-orm'
import { getDb } from './client.js'
import { users, channels, reels, compilations, spendEvents, trendingNiches } from './schema.js'

// Records a paid call that has no reel or channel to bill yet (channel wizard, voice previews). Every
// paid call must land in a cost column exactly once — this is the sink for the ones with no owning row.
// Best-effort by design: bookkeeping must never fail the creator's request, so a write error is logged
// and swallowed rather than turning a successful generation into a 500.
export async function recordSpendEvent(e: {
  userId: string
  channelId?: string | null
  surface: string
  provider: string
  costCents: number
}): Promise<void> {
  if (!(e.costCents > 0)) return
  try {
    await getDb().insert(spendEvents).values({
      userId: e.userId,
      channelId: e.channelId ?? null,
      surface: e.surface,
      provider: e.provider,
      costCents: e.costCents,
    })
  } catch (err) {
    console.error(`[spend] failed to record ${e.surface} spend (${e.costCents}¢) for user ${e.userId}:`, err)
  }
}

// Attributes a wizard's pre-channel spend to the channel it produced, by stamping the payer's unclaimed
// rows with its id. Attribution only — the cost stays in spend_events and is NOT copied into
// channels.costCents, so there is exactly one home for this money and no way to double-count it. Returns
// the total for logging. (channels.costCents still holds pre-ledger spend from a client-supplied number:
// spoofable and reset mid-flow, which is what this replaced. Nothing writes it going forward.)
export async function claimSetupSpendForChannel(userId: string, channelId: string): Promise<number> {
  try {
    const claimed = await getDb()
      .update(spendEvents)
      .set({ channelId })
      .where(
        and(
          eq(spendEvents.userId, userId),
          isNull(spendEvents.channelId),
          // Only channel-setup surfaces. Without this, an unattributed row from ANY surface gets swept up
          // — a voice preview taken in an existing channel's storyboard would be attributed to whatever
          // channel the operator created next.
          like(spendEvents.surface, 'channel_%'),
        ),
      )
      .returning({ costCents: spendEvents.costCents })
    return claimed.reduce((s, r) => s + r.costCents, 0)
  } catch (err) {
    console.error(`[spend] failed to claim setup spend for channel ${channelId}:`, err)
    return 0
  }
}

// A user's current usage + their effective caps (null caps → caller applies the global default).
// Usage is summed/counted across all channels the user owns (reels inherit ownership via channelId).
export type UserUsage = {
  role: string
  status: string
  monthlyBudgetCents: number | null
  dailyReelQuota: number | null
  spendCentsThisMonth: number
  reelsToday: number
}

export async function getUserUsage(userId: string): Promise<UserUsage | null> {
  const db = getDb()
  const u = await db
    .select({ role: users.role, status: users.status, monthlyBudgetCents: users.monthlyBudgetCents, dailyReelQuota: users.dailyReelQuota })
    .from(users)
    .where(eq(users.id, userId))
    .then((r) => r[0])
  if (!u) return null

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  // Every wallet this user can spend from, in parallel — this runs on the create-reel gate AND on every
  // on-demand paid route (requireSpendBudget), so serial round-trips here are latency on every click.
  //   · reels — the bulk of production spend
  //   · compilations — connective-tissue LLM + TTS
  //   · spend_events — the channel wizard, settings-time style/rubric work, voice previews; the single
  //     home for spend with no reel to bill, and invisible to this cap before it existed
  //   · channels — legacy pre-ledger setup spend; nothing writes it anymore, so it can't overlap the above
  const [[spend], [compSpend], [openSpend], [chanSpend], [cnt]] = await Promise.all([
    db
      .select({ cents: sum(reels.costCents) })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .where(and(eq(channels.userId, userId), gte(reels.createdAt, monthStart))),
    db
      .select({ cents: sum(compilations.costCents) })
      .from(compilations)
      .innerJoin(channels, eq(compilations.channelId, channels.id))
      .where(and(eq(channels.userId, userId), gte(compilations.createdAt, monthStart))),
    db
      .select({ cents: sum(spendEvents.costCents) })
      .from(spendEvents)
      .where(and(eq(spendEvents.userId, userId), gte(spendEvents.createdAt, monthStart))),
    db
      .select({ cents: sum(channels.costCents) })
      .from(channels)
      .where(and(eq(channels.userId, userId), gte(channels.createdAt, monthStart))),
    db
      .select({ n: count() })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .where(and(eq(channels.userId, userId), gte(reels.createdAt, dayStart))),
  ])

  return {
    role: u.role,
    status: u.status,
    monthlyBudgetCents: u.monthlyBudgetCents,
    dailyReelQuota: u.dailyReelQuota,
    spendCentsThisMonth:
      Number(spend?.cents ?? 0) +
      Number(compSpend?.cents ?? 0) +
      Number(chanSpend?.cents ?? 0) +
      Number(openSpend?.cents ?? 0),
    reelsToday: Number(cnt?.n ?? 0),
  }
}

// Fresh account status + monthly usage for the harness's checks before paid work. Only a channel with
// no assigned owner (legacy) returns null. A referenced but missing user is returned with null status,
// so callers deny it rather than mistake a missing account for an ownerless historical channel.
export async function getReelOwnerUsage(
  reelId: string,
): Promise<{ userId: string; role: string | null; status: string | null; monthlyBudgetCents: number | null; spendCentsThisMonth: number } | null> {
  const db = getDb()
  const owner = await db
    .select({ userId: channels.userId, role: users.role, status: users.status, monthlyBudgetCents: users.monthlyBudgetCents })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .leftJoin(users, eq(channels.userId, users.id))
    .where(eq(reels.id, reelId))
    .then((r) => r[0])
  if (!owner?.userId) return null

  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  // Same four wallets as getUserUsage, in parallel — this runs before EVERY paid pipeline step, so serial
  // round-trips here are latency on every image, clip, and TTS call.
  const [[spend], [compSpend], [openSpend], [chanSpend]] = await Promise.all([
    db
      .select({ cents: sum(reels.costCents) })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .where(and(eq(channels.userId, owner.userId), gte(reels.createdAt, monthStart))),
    db
      .select({ cents: sum(compilations.costCents) })
      .from(compilations)
      .innerJoin(channels, eq(compilations.channelId, channels.id))
      .where(and(eq(channels.userId, owner.userId), gte(compilations.createdAt, monthStart))),
    db
      .select({ cents: sum(spendEvents.costCents) })
      .from(spendEvents)
      .where(and(eq(spendEvents.userId, owner.userId), gte(spendEvents.createdAt, monthStart))),
    db
      .select({ cents: sum(channels.costCents) })
      .from(channels)
      .where(and(eq(channels.userId, owner.userId), gte(channels.createdAt, monthStart))),
  ])

  return {
    userId: owner.userId,
    role: owner.role,
    status: owner.status,
    monthlyBudgetCents: owner.monthlyBudgetCents,
    spendCentsThisMonth:
      Number(spend?.cents ?? 0) +
      Number(compSpend?.cents ?? 0) +
      Number(chanSpend?.cents ?? 0) +
      Number(openSpend?.cents ?? 0),
  }
}

// App-wide spend today, across every tenant — feeds the global daily kill-switch (assertGlobalDailyBudget).
// Approximated by reels CREATED today (cost accrues on the reel row shortly after creation), matching the
// createdAt-window convention getUserUsage uses for the monthly figure. Sums EVERY cost column so the
// kill-switch can't be walked past by a surface it doesn't watch.
export async function getGlobalSpendTodayCents(): Promise<number> {
  const db = getDb()
  const now = new Date()
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  // Every wallet, in parallel. Compilations bill the same app-wide wallet; channel setup (legacy) and
  // spend_events cover work with no reel; trending_niches is app-level spend billed to no tenant at all.
  // All three of the latter were invisible here, so setup and research spend could run past the kill-switch.
  const [[row], [compRow], [chanRow], [openRow], [nicheRow]] = await Promise.all([
    db.select({ cents: sum(reels.costCents) }).from(reels).where(gte(reels.createdAt, dayStart)),
    db.select({ cents: sum(compilations.costCents) }).from(compilations).where(gte(compilations.createdAt, dayStart)),
    db.select({ cents: sum(channels.costCents) }).from(channels).where(gte(channels.createdAt, dayStart)),
    db.select({ cents: sum(spendEvents.costCents) }).from(spendEvents).where(gte(spendEvents.createdAt, dayStart)),
    db.select({ cents: sum(trendingNiches.costCents) }).from(trendingNiches).where(gte(trendingNiches.createdAt, dayStart)),
  ])
  return (
    Number(row?.cents ?? 0) +
    Number(compRow?.cents ?? 0) +
    Number(chanRow?.cents ?? 0) +
    Number(openRow?.cents ?? 0) +
    Number(nicheRow?.cents ?? 0)
  )
}
