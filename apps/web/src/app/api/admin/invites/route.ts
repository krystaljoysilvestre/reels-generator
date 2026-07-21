import { type NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getDb, invites } from '@reels/db'
import { getCurrentUser } from '@/lib/auth'

// Create an invite link. The returned token is opened at /join/<token>, which pre-approves the
// signup (active) with the invite's role.
export async function POST(req: NextRequest) {
  const admin = await getCurrentUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (admin.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { role?: string; email?: string; expiresInDays?: number }
  const role = body.role === 'admin' ? 'admin' : 'tester'
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.toLowerCase().trim() : null
  const days = Number(body.expiresInDays) > 0 ? Number(body.expiresInDays) : 14
  const token = randomBytes(18).toString('hex')
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  await getDb().insert(invites).values({ token, role, email, createdBy: admin.id, expiresAt })
  return NextResponse.json({ token })
}
