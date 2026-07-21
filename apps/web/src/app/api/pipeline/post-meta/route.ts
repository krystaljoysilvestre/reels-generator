import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, reels } from '@reels/db'
import { PostMetaSchema } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// The reel's post package (title/hook/caption/hashtags). Written by the generate_post_meta step;
// this route lets the operator read + edit it before exporting. GET → { postMeta } (null when the
// step hasn't run yet); PATCH → save edits.

export async function GET(req: NextRequest) {
  const reelId = req.nextUrl.searchParams.get('reelId')
  if (!reelId) return NextResponse.json({ error: 'Missing reelId' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const reel = await getDb().query.reels.findFirst({
    where: eq(reels.id, reelId),
    columns: { postMeta: true },
  })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = PostMetaSchema.safeParse(reel.postMeta)
  return NextResponse.json({ postMeta: parsed.success ? parsed.data : null })
}

const PatchSchema = z.object({
  reelId: z.string().uuid(),
  postMeta: PostMetaSchema,
})

export async function PATCH(req: NextRequest) {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { reelId, postMeta } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { id: true } })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await db.update(reels).set({ postMeta, updatedAt: new Date() }).where(eq(reels.id, reelId))
  return NextResponse.json({ ok: true })
}
