import { NextResponse } from 'next/server'
import { and, count, eq, inArray } from 'drizzle-orm'
import { getDb, assets, channels, compilations, reels, stories, getUserUsage, getGlobalSpendTodayCents } from '@reels/db'
import { assertGlobalDailyBudget, GlobalBudgetExceededError, GLOBAL_DAILY_SPEND_CAP_CENTS, DEFAULT_USER_LIMITS, checkUserLimits, MAX_INFLIGHT_REELS_PER_USER, UNSHIPPED_REEL_STATUSES } from '@reels/core'
import { getCurrentUser, type SessionUser } from '@/lib/auth'
import { ACCOUNT_UNAVAILABLE } from '@/lib/user-profile'
import { isUuid, storageScopeFromKey } from '@/lib/storage-key'

export { isUuid, reelIdFromKey } from '@/lib/storage-key'

// API-route authorization. The page layer uses the redirect/notFound guards in `lib/access.ts`;
// API routes can't redirect, so these mirror the same tenancy rule (admin sees all; a tester is
// confined to channels they own — reels/stories/scenes inherit ownership through channels.userId)
// but return a NextResponse the caller returns early.
//
// Usage:
//   const gate = await requireReelOwner(reelId)
//   if (gate instanceof NextResponse) return gate
//   const user = gate  // active, owning user (or admin)
//
// Unlike the old bare `getSession()`, every gate here ALSO requires status === 'active', so
// pending/suspended accounts can no longer drive the API on a still-valid JWT.

export type Denied = NextResponse

const deny = (status: number, error: string): Denied => NextResponse.json({ error }, { status })

// Postgres uuid columns throw (22P02) on malformed text. Client-supplied ids hit uuid columns, so
// screen them first and treat a bad id as "not found" (never a 500, never a DB round-trip).
// Authenticated AND active. The base gate for routes that don't touch a stored tenant object
// (uploads to fresh keys, LLM helpers that act only on the request body).
export async function requireApiUser(): Promise<SessionUser | Denied> {
  const u = await getCurrentUser()
  if (!u) return deny(401, 'Unauthorized')
  // Signed in, but the account row could not be read (see lib/user-profile). Report the outage as an
  // outage: a 401 here would tell the creator their session ended and send them to sign in again,
  // which neither describes nor fixes the problem — and is how a saturated connection pool used to
  // present itself mid-flow.
  if (u.status === ACCOUNT_UNAVAILABLE) {
    return deny(503, 'We couldn’t reach your account just now. Give it a moment and try again.')
  }
  if (u.status !== 'active') return deny(403, 'Account is not active')
  return u
}

// Active admin. For routes that must be admin-only regardless of ownership.
export async function requireApiAdmin(): Promise<SessionUser | Denied> {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  if (gate.role !== 'admin') return deny(403, 'Forbidden')
  return gate
}

// Active user who owns `channelId` (admin bypasses ownership). 404 — not 403 — on a channel the
// caller doesn't own, so the API never confirms another tenant's ids exist.
export async function requireChannelOwner(channelId: unknown): Promise<SessionUser | Denied> {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate
  if (!isUuid(channelId)) return deny(404, 'Not found')
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .then((r) => r[0])
  if (!row || (user.role !== 'admin' && row.ownerId !== user.id)) return deny(404, 'Not found')
  return user
}

// Active user who owns `reelId` (resolves ownership through the reel's channel; admin bypasses).
export async function requireReelOwner(reelId: unknown): Promise<SessionUser | Denied> {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate
  if (!isUuid(reelId)) return deny(404, 'Not found')
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(eq(reels.id, reelId))
    .then((r) => r[0])
  if (!row || (user.role !== 'admin' && row.ownerId !== user.id)) return deny(404, 'Not found')
  return user
}

// Active user who owns `storyId` (resolves ownership through the story's channel; admin bypasses).
export async function requireStoryOwner(storyId: unknown): Promise<SessionUser | Denied> {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate
  if (!isUuid(storyId)) return deny(404, 'Not found')
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(stories)
    .innerJoin(channels, eq(stories.channelId, channels.id))
    .where(eq(stories.id, storyId))
    .then((r) => r[0])
  if (!row || (user.role !== 'admin' && row.ownerId !== user.id)) return deny(404, 'Not found')
  return user
}

// Does `key` name an R2 object the user is allowed to reference (as an image reference, uploaded
// bed, etc.)? Public objects live in a deliberately small allowlist. Every private namespace resolves
// through a channel owner; old unscoped keys are accepted only when an existing DB record supplies
// that missing ownership edge. Unknown keys fail closed.
export async function callerMayUseStorageKey(user: SessionUser, key: unknown): Promise<boolean> {
  if (typeof key !== 'string' || key.length === 0) return false
  const db = getDb()
  const scope = storageScopeFromKey(key)
  if (scope.kind === 'shared') return true

  let ownerId: string | null | undefined
  if (scope.kind === 'channel') {
    ownerId = await db.select({ ownerId: channels.userId }).from(channels).where(eq(channels.id, scope.id)).then((r) => r[0]?.ownerId)
  } else if (scope.kind === 'reel') {
    ownerId = await db.select({ ownerId: channels.userId }).from(reels).innerJoin(channels, eq(reels.channelId, channels.id)).where(eq(reels.id, scope.id)).then((r) => r[0]?.ownerId)
  } else if (scope.kind === 'compilation') {
    ownerId = await db.select({ ownerId: channels.userId }).from(compilations).innerJoin(channels, eq(compilations.channelId, channels.id)).where(eq(compilations.id, scope.id)).then((r) => r[0]?.ownerId)
  }
  if (ownerId !== undefined) return user.role === 'admin' || ownerId === user.id

  // Compatibility for historical objects whose path predates tenant scoping. Migration 0066
  // materializes their known channel/reel references into this indexed ownership ledger.
  const [channelAssetOwners, reelAssetOwners] = await Promise.all([
    db.select({ ownerId: channels.userId }).from(assets).innerJoin(channels, eq(assets.channelId, channels.id)).where(eq(assets.storageKey, key)),
    db.select({ ownerId: channels.userId }).from(assets).innerJoin(reels, eq(assets.reelId, reels.id)).innerJoin(channels, eq(reels.channelId, channels.id)).where(eq(assets.storageKey, key)),
  ])
  const references = [...channelAssetOwners, ...reelAssetOwners]
  if (references.length === 0) return false
  if (user.role === 'admin') return true
  const ownerIds = new Set(references.map((row) => row.ownerId).filter((id): id is string => typeof id === 'string'))
  // A historical key linked to multiple tenants is already ambiguous at the bucket layer. Deny it to
  // everyone rather than let query ordering decide who sees the shared object.
  return ownerIds.size === 1 && ownerIds.has(user.id)
}

// Cost-safety gate for ON-DEMAND paid actions (previews, image/motion regen, add-sound) that spend
// provider money OUTSIDE the reel-creation flow — where checkUserLimits and the mid-pipeline
// assertUserBudget never run. Mirrors the two ceilings the worker harness enforces before every paid
// step: the app-wide daily kill-switch, then the caller's month-to-date budget. Admins are exempt, as
// they are at creation. Returns a 429 Denied to short-circuit the route, or null when spending is OK.
export async function requireSpendBudget(user: SessionUser): Promise<Denied | null> {
  if (user.role === 'admin') return null
  // Only query app-wide spend when a cap is actually configured — otherwise assertGlobalDailyBudget is a
  // no-op and the aggregate scan is pure latency on every preview click. Same guard the harness uses.
  if (GLOBAL_DAILY_SPEND_CAP_CENTS !== null) {
    try {
      assertGlobalDailyBudget(await getGlobalSpendTodayCents())
    } catch (e) {
      if (e instanceof GlobalBudgetExceededError) return deny(429, e.message)
      throw e
    }
  }
  const usage = await getUserUsage(user.id)
  if (usage && usage.role !== 'admin') {
    const cap = usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents
    if (usage.spendCentsThisMonth >= cap) {
      return deny(429, `Monthly budget reached ($${(cap / 100).toFixed(2)}). Ask the admin to raise it.`)
    }
  }
  return null
}

// Cost-safety gate for CREATING a reel — the sibling of requireSpendBudget for the one action that
// commits a whole pipeline's worth of spend rather than a single call. Two ceilings: the caller's
// budget/daily-reel quota, then how many reels they may have building at once (a burst of creates can
// all clear the lagging budget gate at $0 and then run past it in parallel; the mid-pipeline
// assertUserBudget enforces the dollar total, this smooths the burst). Admins are exempt.
//
// Lives here, not in a route: it is the only other place besides the ownership helpers that compares
// against channels.userId, and that comparison is the single seam a future workspace layer replaces.
export async function requireReelCreationBudget(user: SessionUser): Promise<Denied | null> {
  if (user.role === 'admin') return null
  const usage = await getUserUsage(user.id)
  if (usage) {
    const res = checkUserLimits(usage, {
      monthlyBudgetCents: usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents,
      dailyReelQuota: usage.dailyReelQuota ?? DEFAULT_USER_LIMITS.dailyReelQuota,
    })
    if (!res.ok) return deny(429, res.reason)
  }
  const [inflight] = await getDb()
    .select({ n: count() })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(and(eq(channels.userId, user.id), inArray(reels.status, [...UNSHIPPED_REEL_STATUSES])))
  if ((inflight?.n ?? 0) >= MAX_INFLIGHT_REELS_PER_USER) {
    return deny(429, `Too many reels in progress (max ${MAX_INFLIGHT_REELS_PER_USER}). Finish or clear some first.`)
  }
  return null
}
