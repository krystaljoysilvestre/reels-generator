import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, notExists, sql } from 'drizzle-orm'
import { getDb, reels, stories } from '@reels/db'
import { requireStoryOwner } from '@/lib/api-access'

// Story-library edit + delete. A story that a reel is already building from is OFF LIMITS here: scene
// text writes back through to stories.body (edit-scene-text), so editing behind the reel's back would
// desync the script from the storyboard — and deleting would null the reel's storyId (FK set null) and
// dead-end it at analyze_story ("Reel has no story"). Both cases 409 and point at the reel instead.

const PatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    body: z.string().trim().min(1).max(20000).optional(),
  })
  .refine((v) => v.title !== undefined || v.body !== undefined, { message: 'Nothing to update' })

async function isInProduction(storyId: string): Promise<boolean> {
  const db = getDb()
  const row = await db.select({ id: reels.id }).from(reels).where(eq(reels.storyId, storyId)).limit(1)
  return row.length > 0
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireStoryOwner(id)
  if (gate instanceof NextResponse) return gate
  const user = gate

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const { title, body } = parsed.data
  const db = getDb()
  // One statement, same as DELETE: a separate "is it in production?" read would let a make-reel land in
  // the gap and write an edit into a script whose analyze_story is already queued — the reel would then
  // be building from text the storyboard never saw.
  const [updated] = await db
    .update(stories)
    .set({
      ...(title !== undefined ? { title } : {}),
      ...(body !== undefined ? { body } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(stories.id, id), notExists(db.select({ n: sql`1` }).from(reels).where(eq(reels.storyId, id)))))
    .returning({ id: stories.id, title: stories.title, body: stories.body })
  if (!updated) {
    // Nothing updated: either it's linked to a reel now, or it's gone.
    return (await isInProduction(id))
      ? NextResponse.json({ error: 'This story is already in production — edit it from its reel.' }, { status: 409 })
      : NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  console.log('[audit] story edited', { storyId: id, userId: user.id })
  return NextResponse.json({ story: updated })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireStoryOwner(id)
  if (gate instanceof NextResponse) return gate
  const user = gate

  const db = getDb()
  // One conditional statement, not check-then-delete: a make-reel racing this would otherwise slip
  // between the two and get its storyId nulled out from under it.
  const deleted = await db
    .delete(stories)
    .where(
      and(
        eq(stories.id, id),
        notExists(db.select({ one: sql`1` }).from(reels).where(eq(reels.storyId, id))),
      ),
    )
    .returning({ id: stories.id })

  if (deleted.length === 0) {
    // Either gone already, or a reel claimed it (the 409 case the UI hides the button for).
    if (await isInProduction(id)) {
      return NextResponse.json({ error: 'This story is already in production — delete its reel first.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  console.log('[audit] story deleted', { storyId: id, userId: user.id })
  return NextResponse.json({ ok: true })
}
