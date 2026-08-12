import { type NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, users } from '@reels/db'
import { requireApiAdmin, isUuid } from '@/lib/api-access'
import { invalidateUserProfile } from '@/lib/user-profile'

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
  // Granting or revoking someone's access is the most security-relevant write in the app and there is
  // no audit table yet, so at minimum it must be reconstructable from logs: actor, target, change.
  console.log(`[audit] admin ${admin.id} updated user ${id}: ${JSON.stringify(patch)}`)
  // role/status are read through a short-lived cache on every request (lib/user-profile); drop this
  // user's entry so approving or suspending them lands on their very next request, not up to a TTL later.
  invalidateUserProfile(id)
  return NextResponse.json({ ok: true })
}
