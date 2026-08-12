import { eq } from 'drizzle-orm'
import { getDb, users } from '@reels/db'

// The account fields authentication needs on every request: what this user may do (role), whether
// they may do anything at all (status), and how they are shown (name/image).
//
// Why this sits behind a cache rather than a plain query in the session callback:
//
// role/status are deliberately NOT carried in the JWT — an admin approving, suspending or re-roling
// someone has to take effect on their next request, not their next login. That correctly put a users
// read on every request, but it also put the database on the critical path of authentication, and
// @auth/core treats a session callback that throws as "there is no session" (it logs a JWTSessionError
// and returns an empty body). So a database that was merely out of connections did not report itself
// as a database problem: it silently logged the creator out mid-flow.
//
// Two changes fix that without giving up freshness:
//   1. A short TTL takes the read off the per-request path. Admin writes invalidate this directly
//      (see api/admin/users/[id]), so approve/suspend stays immediate for the action that matters;
//      the TTL only bounds changes made outside the app, e.g. straight against the database.
//   2. A read that FAILS falls back to the last known profile, so a blip cannot end a valid session.
//      With nothing cached to fall back on we return ACCOUNT_UNAVAILABLE, which the gates turn into
//      a 503 — an honest "we cannot reach your account" instead of a 401 that blames the creator's
//      credentials and sends them to a sign-in page that fixes nothing.
//
// The cache is per process. A second web instance can lag an admin write by up to the TTL, which is
// the same staleness window the TTL already allows, so nothing new rests on it.

export type UserProfile = {
  role: string
  status: string
  name: string | null
  image: string | null
}

// A session that is cryptographically valid but whose account we could not read. Distinct from every
// real status value in the users table, so no gate can confuse it for a decision about the account.
export const ACCOUNT_UNAVAILABLE = 'unavailable'

const TTL_MS = 30_000
// Bounds the map for a future with many tenants; entries are tiny and expired ones are dropped first.
const MAX_ENTRIES = 5_000

type Entry = { readAt: number; profile: UserProfile }
const cache = new Map<string, Entry>()

function prune(now: number): void {
  for (const [id, entry] of cache) if (now - entry.readAt >= TTL_MS) cache.delete(id)
  // Still oversized after dropping the expired: evict oldest-first (Map preserves insertion order).
  if (cache.size > MAX_ENTRIES) {
    for (const id of cache.keys()) {
      cache.delete(id)
      if (cache.size <= MAX_ENTRIES) break
    }
  }
}

/** Drop the cached profile for a user — call after any write that changes their role or status. */
export function invalidateUserProfile(userId: string): void {
  cache.delete(userId)
}

/**
 * The user's profile, or:
 *   'missing'                — no such user row (deleted account on a still-valid token)
 *   ACCOUNT_UNAVAILABLE      — the row could not be read and nothing cached was available
 */
export async function getUserProfile(userId: string): Promise<UserProfile | 'missing' | typeof ACCOUNT_UNAVAILABLE> {
  const now = Date.now()
  const cached = cache.get(userId)
  if (cached && now - cached.readAt < TTL_MS) return cached.profile

  try {
    const row = await getDb()
      .select({ role: users.role, status: users.status, name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, userId))
      .then((r) => r[0])
    if (!row) {
      cache.delete(userId)
      return 'missing'
    }
    const profile: UserProfile = {
      role: row.role,
      status: row.status,
      name: row.name ?? null,
      image: row.image ?? null,
    }
    if (cache.size >= MAX_ENTRIES) prune(now)
    cache.set(userId, { readAt: now, profile })
    return profile
  } catch (e) {
    // Expired-but-present beats ending a valid session over one failed read — but log it, or the
    // cache silently masks a failing database for as long as people keep making requests, which is
    // the same invisibility this module exists to remove.
    if (cached) {
      console.warn('[auth] users lookup failed; serving a stale cached profile', e)
      return cached.profile
    }
    console.error('[auth] users lookup failed and no cached profile to fall back on', e)
    return ACCOUNT_UNAVAILABLE
  }
}
