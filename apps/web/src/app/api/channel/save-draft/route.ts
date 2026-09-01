import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, channels } from '@reels/db'
import { requireApiUser, requireChannelOwner } from '@/lib/api-access'

// Persist an in-progress wizard as a 'draft' channel so the operator can leave and resume later
// (it shows on the dashboard, separate from finished channels). Lenient by design: a draft may be
// half-filled, so nothing is required — the full wizard state rides along in `draftState` and is
// re-hydrated on resume, while `name`/`nicheDescription` are denormalized for the dashboard card.
const InputSchema = z.object({
  draftChannelId: z.string().uuid().nullish(), // present → update that draft; absent → create one
  name: z.string().trim().max(80).default(''),
  nicheDescription: z.string().trim().max(8000).default(''),
  draftState: z.record(z.unknown()), // opaque wizard-state blob (validated on hydrate, not here)
})

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { draftChannelId, name, nicheDescription, draftState } = parsed.data
  const db = getDb()

  const fields = {
    name: name || 'Untitled draft',
    nicheDescription,
    draftState,
    status: 'draft' as const,
    updatedAt: new Date(),
  }

  // Update only an existing owned draft. A client-supplied foreign/missing id is not an instruction
  // to create a second row, and null-owner legacy rows are never silently adopted by a tester.
  if (draftChannelId) {
    const ownerGate = await requireChannelOwner(draftChannelId)
    if (ownerGate instanceof NextResponse) return ownerGate
    const existing = await db.query.channels.findFirst({ where: eq(channels.id, draftChannelId) })
    if (existing?.status === 'draft') {
      await db.update(channels).set(fields).where(eq(channels.id, draftChannelId))
      console.log(`[audit] channel.draft.save actor=${user.id} channel=${draftChannelId} outcome=updated`)
      return NextResponse.json({ channelId: draftChannelId })
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const [row] = await db.insert(channels).values({ ...fields, userId: user.id }).returning({ id: channels.id })
  console.log(`[audit] channel.draft.save actor=${user.id} channel=${row!.id} outcome=created`)
  return NextResponse.json({ channelId: row!.id })
}

// Discard a saved draft (the "Discard" choice in the leave modal). Guarded to status='draft' and to
// the caller's own drafts (admins may discard any) so it can never delete a finished or foreign channel.
export async function DELETE(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const ownerGate = await requireChannelOwner(id)
  if (ownerGate instanceof NextResponse) return ownerGate
  const db = getDb()
  await db.delete(channels).where(and(eq(channels.id, id), eq(channels.status, 'draft')))
  console.log(`[audit] channel.draft.delete actor=${user.id} channel=${id}`)
  return NextResponse.json({ ok: true })
}
