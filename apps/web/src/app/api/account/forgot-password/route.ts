import { createHash } from 'node:crypto'
import { after, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, users } from '@reels/db'
import { checkRateLimit } from '@reels/providers'
import { clientIp } from '@/lib/request'
import { isAccountEmailConfigured, sendAccountEmail } from '@/lib/account-email'
import { issueAccountToken } from '@/lib/account-tokens'

const Schema = z.object({ email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()) }).strict()

export async function POST(req: Request) {
  const ipLimit = await checkRateLimit(`account:forgot:ip:${clientIp(req)}`, 10, 60 * 60 * 1000)
  if (!ipLimit.ok) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(ipLimit.retryAfterSec) } })
  const parsed = Schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  const emailKey = createHash('sha256').update(parsed.data.email).digest('hex')
  const emailLimit = await checkRateLimit(`account:forgot:email:${emailKey}`, 3, 60 * 60 * 1000)
  if (!emailLimit.ok) return NextResponse.json({ error: 'Please wait before requesting another email.' }, { status: 429, headers: { 'Retry-After': String(emailLimit.retryAfterSec) } })
  // This check is global, before any account lookup, so an unavailable mail setup cannot expose
  // which addresses have accounts. The response never reflects account existence or delivery.
  if (!isAccountEmailConfigured()) return NextResponse.json({ error: 'Password recovery emails are not available yet. Please contact support.' }, { status: 503 })
  after(async () => {
    try {
      const [account] = await getDb().select({ id: users.id, email: users.email, passwordHash: users.passwordHash }).from(users).where(eq(users.email, parsed.data.email))
      if (!account?.email || !account.passwordHash) return
      const token = await issueAccountToken(account.id, 'reset')
      await sendAccountEmail(account.email, 'reset', token)
    } catch {
      console.error('[account] Password recovery email request failed.')
    }
  })
  return NextResponse.json({ ok: true })
}
