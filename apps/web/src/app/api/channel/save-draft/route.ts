import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb, channels } from '@reels/db'
import { getCurrentUser } from '@/lib/auth'

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
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  // Update the existing draft only if it's still a draft AND the caller owns it (admins bypass;
  // legacy null-owner drafts are adoptable); else insert a fresh, owned draft.
  if (draftChannelId) {
    const existing = await db.query.channels.findFirst({ where: eq(channels.id, draftChannelId) })
    const owns = user.role === 'admin' || existing?.userId === user.id || existing?.userId == null
    if (existing && existing.status === 'draft' && owns) {
      await db.update(channels).set({ ...fields, userId: user.id }).where(eq(channels.id, draftChannelId))
      return NextResponse.json({ channelId: draftChannelId })
    }
  }
  const [row] = await db.insert(channels).values({ ...fields, userId: user.id }).returning({ id: channels.id })
  return NextResponse.json({ channelId: row!.id })
}

// Discard a saved draft (the "Discard" choice in the leave modal). Guarded to status='draft' and to
// the caller's own drafts (admins may discard any) so it can never delete a finished or foreign channel.
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const db = getDb()
  const ownership = user.role === 'admin' ? undefined : eq(channels.userId, user.id)
  await db.delete(channels).where(and(eq(channels.id, id), eq(channels.status, 'draft'), ownership))
  return NextResponse.json({ ok: true })
}
