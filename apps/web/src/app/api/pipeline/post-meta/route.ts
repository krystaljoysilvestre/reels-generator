import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, reels, channels } from '@reels/db'
import { PostMetaSchema, resolveSidecarSrt, thumbnailOverlay } from '@reels/core'
import { enqueueStep } from '@reels/queue'
import { requireReelOwner } from '@/lib/api-access'
import { publishingCopy } from '@/lib/publishing-copy'

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
    with: { story: true },
  })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const channel = await getDb().query.channels.findFirst({
    where: eq(channels.id, reel.channelId), columns: { captionStyle: true },
  })
  return NextResponse.json({
    ...await publishingCopy(reel),
    hasSubtitles: Boolean(resolveSidecarSrt(reel.timings, channel?.captionStyle)),
  }, { headers: { 'Cache-Control': 'private, no-store' } })
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
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { id: true, postMeta: true } })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // What the cover would burn BEFORE this save, so an edit that doesn't touch the overlay doesn't queue a
  // pointless rebuild. thumbnailOverlay() falls back to the title, so a title edit can move the overlay too.
  const before = PostMetaSchema.safeParse(reel.postMeta)
  const overlayBefore = before.success ? thumbnailOverlay(before.data) : ''

  await db.update(reels).set({ postMeta, updatedAt: new Date() }).where(eq(reels.id, reelId))

  // Rebuild the cover when the burned words changed. Editing the thumbnail text used to be inert: the
  // composite was built inside the render step, whose inputHash excludes postMeta, so the save was
  // followed by a cache skip and the STALE cover was what published. Compositing is $0 and takes seconds.
  const coverStale = thumbnailOverlay(postMeta) !== overlayBefore
  if (coverStale) {
    try {
      await enqueueStep({ reelId, stepName: 'compose_cover' })
    } catch (err) {
      // The text is already saved; a queue outage must not lose the creator's edit. Report it so the UI
      // can say the cover is still catching up rather than silently showing an old image.
      console.warn(`[post-meta] cover rebuild not queued for ${reelId.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`)
      return NextResponse.json({ ok: true, coverRebuilding: false, coverRebuildQueueFailed: true })
    }
  }
  return NextResponse.json({ ok: true, coverRebuilding: coverStale })
}
