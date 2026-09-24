import { eq } from 'drizzle-orm'
import { getDb, users } from '@reels/db'

// Session authorization is read from the account, with a 30-second per-process cache.
// Account mutations invalidate locally; other instances converge within that window.
// After the TTL, a failed read fails closed as ACCOUNT_UNAVAILABLE. Reusing expired
// authorization indefinitely could revive suspended accounts or recovered sessions.

export type UserProfile = {
  role: string
  status: string
  name: string | null
  image: string | null
  authVersion: number
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
      .select({ role: users.role, status: users.status, name: users.name, image: users.image, authVersion: users.authVersion })
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
      authVersion: row.authVersion,
    }
    if (cache.size >= MAX_ENTRIES) prune(now)
    cache.set(userId, { readAt: now, profile })
    return profile
  } catch (e) {
    console.error('[auth] account lookup failed; authorization unavailable', e)
    return ACCOUNT_UNAVAILABLE
  }
}
