import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, users } from '@reels/db'
import { checkRateLimit } from '@reels/providers'
import { requireApiUser } from '@/lib/api-access'
import { invalidateUserProfile } from '@/lib/user-profile'

const ProfileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use 80 characters or fewer.'),
}).strict()

export async function PATCH(req: NextRequest) {
  const user = await requireApiUser()
  if (user instanceof NextResponse) return user

  const parsed = ProfileSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a name between 1 and 80 characters.' }, { status: 400 })
  }

  const limit = await checkRateLimit(`account:profile:${user.id}`, 30, 60 * 60 * 1000)
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'You’ve made a few changes. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
    )
  }

  try {
    // No target id or account privileges come from the body, including for an admin caller.
    const [updated] = await getDb().update(users)
      .set({ name: parsed.data.name })
      .where(eq(users.id, user.id))
      .returning({ name: users.name })
    if (!updated) return NextResponse.json({ error: 'Account not found.' }, { status: 404 })

    invalidateUserProfile(user.id)
    // users has no updatedAt column; the audit entry supplies actor, action and time without PII.
    console.log('[audit] account.profile.updated', { actor: user.id, at: new Date().toISOString() })
    return NextResponse.json({ name: updated.name })
  } catch (error) {
    console.error('[account] profile update failed', { userId: user.id, error })
    return NextResponse.json({ error: 'Your name couldn’t be saved. Please try again.' }, { status: 500 })
  }
}
