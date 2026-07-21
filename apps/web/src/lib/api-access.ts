import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, channels, reels, stories } from '@reels/db'
import { getCurrentUser, type SessionUser } from '@/lib/auth'

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

// Authenticated AND active. The base gate for routes that don't touch a stored tenant object
// (uploads to fresh keys, LLM helpers that act only on the request body).
export async function requireApiUser(): Promise<SessionUser | Denied> {
  const u = await getCurrentUser()
  if (!u) return deny(401, 'Unauthorized')
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
  if (user.role === 'admin') return user
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(channels)
    .where(eq(channels.id, channelId))
    .then((r) => r[0])
  if (!row || row.ownerId !== user.id) return deny(404, 'Not found')
  return user
}

// Active user who owns `reelId` (resolves ownership through the reel's channel; admin bypasses).
export async function requireReelOwner(reelId: unknown): Promise<SessionUser | Denied> {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate
  if (!isUuid(reelId)) return deny(404, 'Not found')
  if (user.role === 'admin') return user
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(eq(reels.id, reelId))
    .then((r) => r[0])
  if (!row || row.ownerId !== user.id) return deny(404, 'Not found')
  return user
}

// Active user who owns `storyId` (resolves ownership through the story's channel; admin bypasses).
export async function requireStoryOwner(storyId: unknown): Promise<SessionUser | Denied> {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate
  if (!isUuid(storyId)) return deny(404, 'Not found')
  if (user.role === 'admin') return user
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(stories)
    .innerJoin(channels, eq(stories.channelId, channels.id))
    .where(eq(stories.id, storyId))
    .then((r) => r[0])
  if (!row || row.ownerId !== user.id) return deny(404, 'Not found')
  return user
}

// Does `key` name an R2 object the user is allowed to reference (as an image reference, uploaded
// bed, etc.)? Used to stop routes that accept a client-supplied storageKey from pointing a render
// at another tenant's object. `reels/<reelId>/...` keys must resolve to a reel the caller owns;
// non-reel keys (fresh `uploads/`, `avatars/`, shared presets) are random/unguessable and allowed.
export async function callerMayUseStorageKey(user: SessionUser, key: unknown): Promise<boolean> {
  if (typeof key !== 'string' || key.length === 0) return false
  const reelId = reelIdFromKey(key)
  if (reelId === undefined) return true // not a reel-scoped key → not another tenant's derived asset
  if (reelId === null) return false // malformed reels/ key
  if (user.role === 'admin') return true
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(eq(reels.id, reelId))
    .then((r) => r[0])
  return !!row && row.ownerId === user.id
}

// Parse the reelId out of a `reels/<reelId>/...` storage key.
//   undefined → not a reels/ key   |   null → reels/ key with a bad id   |   string → the reelId
export function reelIdFromKey(key: string): string | null | undefined {
  if (!key.startsWith('reels/')) return undefined
  const seg = key.split('/')[1]
  return isUuid(seg) ? seg : null
}
