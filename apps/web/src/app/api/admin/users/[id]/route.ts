import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, users } from '@reels/db'
import { getCurrentUser } from '@/lib/auth'

// Admin user management: change status (approve / suspend / reset to pending) and/or role.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentUser()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (admin.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = (await req.json().catch(() => ({}))) as { status?: string; role?: string }
  const patch: { status?: string; role?: string } = {}
  if (body.status && ['active', 'suspended', 'pending'].includes(body.status)) patch.status = body.status
  if (body.role && ['admin', 'tester'].includes(body.role)) patch.role = body.role

  if (id === admin.id && (patch.role === 'tester' || patch.status === 'suspended' || patch.status === 'pending')) {
    return NextResponse.json({ error: 'You cannot demote or lock your own admin account.' }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  await getDb().update(users).set(patch).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}
