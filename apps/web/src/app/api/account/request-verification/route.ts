import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, users } from '@reels/db'
import { checkRateLimit } from '@reels/providers'
import { getCurrentUser } from '@/lib/auth'
import { isAccountEmailConfigured, sendAccountEmail } from '@/lib/account-email'
import { issueAccountToken } from '@/lib/account-tokens'

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Sign in to verify your email.' }, { status: 401 })
  if (user.status === 'unavailable') return NextResponse.json({ error: 'Your account is temporarily unavailable.' }, { status: 503 })
  if (!['pending', 'active'].includes(user.status)) return NextResponse.json({ error: 'Account is not available.' }, { status: 403 })
  if (!z.object({}).strict().safeParse(await req.json().catch(() => null)).success) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const limit = await checkRateLimit(`account:verify-request:${user.id}`, 3, 15 * 60 * 1000)
  if (!limit.ok) return NextResponse.json({ error: 'Please wait before requesting another email.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } })
  if (!isAccountEmailConfigured()) return NextResponse.json({ error: 'Verification emails are not available yet. Please contact support.' }, { status: 503 })
  try {
    const [account] = await getDb().select({ email: users.email, emailVerified: users.emailVerified, status: users.status }).from(users).where(eq(users.id, user.id))
    if (!account?.email || !['pending', 'active'].includes(account.status)) return NextResponse.json({ error: 'Account is not available.' }, { status: 403 })
    if (!account.emailVerified) {
      const token = await issueAccountToken(user.id, 'verify')
      await sendAccountEmail(account.email, 'verify', token)
    }
    return NextResponse.json({ ok: true })
  } catch {
    console.error('[account] Verification email request failed.')
    return NextResponse.json({ error: 'We could not send your email. Please try again shortly.' }, { status: 503 })
  }
}
