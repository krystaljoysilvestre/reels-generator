import { cookies } from 'next/headers'
import { eq } from 'drizzle-orm'
import { getDb, invites, users } from '@reels/db'

const INVITE_COOKIE = 'invite_token'

export type InviteRow = typeof invites.$inferSelect

export async function setInviteCookie(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(INVITE_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 })
}

export async function readInviteToken(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(INVITE_COOKIE)?.value ?? null
}

async function clearInviteCookie(): Promise<void> {
  try {
    const jar = await cookies()
    jar.delete(INVITE_COOKIE)
  } catch {
    // Cookie mutation isn't allowed in every context (e.g. some render paths) — best-effort.
  }
}

// Valid = exists, not yet consumed, and not expired.
export async function validateInvite(token: string): Promise<InviteRow | null> {
  if (!token) return null
  const db = getDb()
  const row = await db.select().from(invites).where(eq(invites.token, token)).then((r) => r[0])
  if (!row) return null
  if (row.usedAt || row.usedByUserId) return null
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return null
  return row
}

// If a valid invite cookie is present, upgrade the freshly-created user to the invite's role + active
// and mark the invite consumed. No-op (and clears a stale cookie) when there's no valid invite.
export async function consumeInviteForUser(userId: string): Promise<void> {
  const token = await readInviteToken()
  if (!token) return
  const invite = await validateInvite(token)
  if (!invite) {
    await clearInviteCookie()
    return
  }
  const db = getDb()
  await db.update(users).set({ role: invite.role, status: 'active' }).where(eq(users.id, userId))
  await db.update(invites).set({ usedByUserId: userId, usedAt: new Date() }).where(eq(invites.id, invite.id))
  await clearInviteCookie()
}
