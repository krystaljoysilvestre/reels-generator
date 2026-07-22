import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, users } from '@reels/db'
import { requireApiAdmin, isUuid } from '@/lib/api-access'

// Admin user management: change status (approve / suspend / reset to pending) and/or role.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireApiAdmin()
  if (gate instanceof NextResponse) return gate
  const admin = gate

  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
