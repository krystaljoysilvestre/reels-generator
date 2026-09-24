import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit } from '@reels/providers'
import { clientIp } from '@/lib/request'
import { accountTokenSchema, verifyAccountEmail } from '@/lib/account-tokens'

const Schema = z.object({ token: accountTokenSchema }).strict()

export async function POST(req: Request) {
  const limit = await checkRateLimit(`account:verify:ip:${clientIp(req)}`, 20, 15 * 60 * 1000)
  if (!limit.ok) return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } })
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'This link is invalid or has expired.' }, { status: 400 })
  try {
    if (!await verifyAccountEmail(parsed.data.token)) return NextResponse.json({ error: 'This link is invalid or has expired. Request a new email.' }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch {
    console.error('[account] Email verification failed.')
    return NextResponse.json({ error: 'We could not verify your email. Please try again shortly.' }, { status: 503 })
  }
}
