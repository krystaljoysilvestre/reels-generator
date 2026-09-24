import { type NextRequest, NextResponse } from 'next/server'
import { getDb, users } from '@reels/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { checkRateLimit } from '@reels/providers'
import { consumeInviteForUser } from '@/lib/invite'
import { clientIp } from '@/lib/request'
import { isOpenSignup } from '@/lib/signup-policy'
import { isAccountEmailConfigured, sendAccountEmail } from '@/lib/account-email'
import { accountPasswordSchema, issueAccountToken } from '@/lib/account-tokens'

// Email/password sign-up. Creates a pending user (or active, if a valid invite cookie is present),
// then the client signs them in via the credentials provider.
const Schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().email().max(254),
  password: accountPasswordSchema,
})

export async function POST(req: NextRequest) {
  if (isOpenSignup() && !isAccountEmailConfigured()) {
    return NextResponse.json({ error: 'Email signup is unavailable right now. Please use Google to join.' }, { status: 503 })
  }
  // Brute-force / mass-signup guard: cap sign-up attempts per IP per hour. Fail-open if Redis is down.
  const rl = await checkRateLimit(`register:ip:${clientIp(req)}`, 10, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const email = parsed.data.email.toLowerCase().trim()
  const db = getDb()

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).then((r) => r[0])
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)
  let created: { id: string } | undefined
  try {
    ;[created] = await db
      .insert(users)
      .values({ email, name: parsed.data.name ?? null, passwordHash })
      .returning({ id: users.id })
  } catch (err) {
    // The existence check above is a TOCTOU; a concurrent signup with the same email can slip between it
    // and this insert. The users.email UNIQUE constraint is the real guard — turn its violation (23505)
    // into the same clean 409 instead of an opaque 500.
    if (err && typeof err === 'object' && (err as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }
    throw err
  }

  if (!created) return NextResponse.json({ error: 'Could not create your account. Please try again.' }, { status: 503 })
  await consumeInviteForUser(created.id)
  let verificationSent = false
  if (isAccountEmailConfigured()) {
    try {
      const token = await issueAccountToken(created.id, 'verify')
      await sendAccountEmail(email, 'verify', token)
      verificationSent = true
    } catch {
      // The account exists. Let the creator sign in and resend from the waiting screen rather
      // than retrying registration into a duplicate-account error. Never log the email/token.
      console.error(`[register] verification delivery failed user=${created.id}`)
    }
  }
  console.log(`[audit] account_created actor=${created.id} target=${created.id}`)
  return NextResponse.json({ ok: true, verificationSent })
}
