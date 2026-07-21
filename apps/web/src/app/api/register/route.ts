import { type NextRequest, NextResponse } from 'next/server'
import { getDb, users } from '@reels/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { checkRateLimit } from '@reels/providers'
import { consumeInviteForUser } from '@/lib/invite'
import { clientIp } from '@/lib/request'

// Email/password sign-up. Creates a pending user (or active, if a valid invite cookie is present),
// then the client signs them in via the credentials provider.
const Schema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export async function POST(req: NextRequest) {
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
  const [created] = await db
    .insert(users)
    .values({ email, name: parsed.data.name ?? null, passwordHash })
    .returning({ id: users.id })

  if (created?.id) await consumeInviteForUser(created.id)
  return NextResponse.json({ ok: true })
}
