import { NextResponse } from 'next/server'
import { and, eq, isNotNull } from 'drizzle-orm'
import { getDb, users } from '@reels/db'
import { z } from 'zod'
import { getCurrentUser } from '@/lib/auth'
import { isOpenSignup } from '@/lib/signup-policy'
import { ACCOUNT_UNAVAILABLE, invalidateUserProfile } from '@/lib/user-profile'

const unavailable = () => NextResponse.json({ error: 'Your account is not eligible for open access.' }, { status: 403 })

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 })
  if (user.status === ACCOUNT_UNAVAILABLE) return NextResponse.json({ error: 'Your account is temporarily unavailable.' }, { status: 503 })
  if (!z.object({}).strict().safeParse(await req.json().catch(() => null)).success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (!isOpenSignup()) return unavailable()

  try {
    const db = getDb()
    const readAccount = async () => (await db.select({ status: users.status, emailVerified: users.emailVerified })
      .from(users).where(eq(users.id, user.id)))[0]
    const account = await readAccount()
    if (!account?.emailVerified || !['pending', 'active'].includes(account.status)) return unavailable()

    if (account.status === 'pending') {
      // Keep verification and suspension in the write predicate too: a concurrent suspension must
      // win over the eligibility read above. Caller identity is exclusively the authenticated user.
      const activated = await db.update(users).set({ status: 'active' }).where(and(
        eq(users.id, user.id), eq(users.status, 'pending'), isNotNull(users.emailVerified),
      )).returning({ id: users.id })
      if (!activated.length) {
        // A second tab may already have completed activation; that success is safe to reuse.
        const current = await readAccount()
        if (current?.status !== 'active' || !current.emailVerified) return unavailable()
      } else {
        console.log(`[audit] early_access_activated actor=${user.id} target=${user.id}`)
      }
    }
    invalidateUserProfile(user.id)
    return NextResponse.json({ ok: true })
  } catch {
    console.error('[account] Early-access activation failed.')
    return NextResponse.json({ error: 'We could not open your studio. Please try again shortly.' }, { status: 503 })
  }
}
