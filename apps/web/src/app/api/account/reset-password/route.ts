import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@reels/providers'
import { clientIp } from '@/lib/request'
import { accountPasswordSchema, accountTokenSchema, resetAccountPassword } from '@/lib/account-tokens'

const Schema = z.object({ token: accountTokenSchema, password: accountPasswordSchema }).strict()

export async function POST(req: Request) {
  const limit = await checkRateLimit(`account:reset:ip:${clientIp(req)}`, 10, 15 * 60 * 1000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } })
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 })
  try {
    if (!await resetAccountPassword(parsed.data.token, parsed.data.password)) return NextResponse.json({ error: 'This link is invalid or has expired. Request a new email.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    console.error('[account] Password reset failed.')
    return NextResponse.json({ error: 'We could not reset your password. Please try again shortly.' }, { status: 503 })
  }
}
