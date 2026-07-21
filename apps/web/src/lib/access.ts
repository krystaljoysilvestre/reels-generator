import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getDb, channels, reels } from '@reels/db'
import { requireUser, type SessionUser } from '@/lib/auth'

// Tenancy rule: an admin sees/does everything; a tester is confined to channels they own
// (reels/stories inherit ownership through channels.userId).

export function isAdmin(user: Pick<SessionUser, 'role'> | null | undefined): boolean {
  return user?.role === 'admin'
}

// List-scoping helper. Returns null for admins (no restriction) or the caller's channel ids
// (possibly empty) for testers — feed into `inArray(reels.channelId, ids)` etc.
export async function accessibleChannelIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === 'admin') return null
  const db = getDb()
  const rows = await db.select({ id: channels.id }).from(channels).where(eq(channels.userId, user.id))
  return rows.map((r) => r.id)
}

// Non-throwing ownership check for API routes.
export async function userOwnsChannel(user: SessionUser, channelId: string): Promise<boolean> {
  if (user.role === 'admin') return true
  const db = getDb()
  const row = await db.select({ userId: channels.userId }).from(channels).where(eq(channels.id, channelId)).then((r) => r[0])
  return !!row && row.userId === user.id
}

// Page-loader guard: current user must own the channel (admins bypass); otherwise 404.
export async function assertChannelAccess(channelId: string): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role === 'admin') return user
  const db = getDb()
  const row = await db.select({ userId: channels.userId }).from(channels).where(eq(channels.id, channelId)).then((r) => r[0])
  if (!row || row.userId !== user.id) notFound()
  return user
}

// Page-loader guard for a reel (resolves ownership through its channel); otherwise 404.
export async function assertReelAccess(reelId: string): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role === 'admin') return user
  const db = getDb()
  const row = await db
    .select({ ownerId: channels.userId })
    .from(reels)
    .innerJoin(channels, eq(reels.channelId, channels.id))
    .where(eq(reels.id, reelId))
    .then((r) => r[0])
  if (!row || row.ownerId !== user.id) notFound()
  return user
}
