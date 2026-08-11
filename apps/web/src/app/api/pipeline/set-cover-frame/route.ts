import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { getDb, reels, assets } from '@reels/db'
import { ReelCoverSchema, type ReelCover } from '@reels/core'
import { enqueueStep } from '@reels/queue'
import { requireReelOwner } from '@/lib/api-access'

// Choose which of the reel's OWN frames the cover is built from.
//
// This is a re-point, not a regeneration — the same shape as set-scene-image: the frames already exist and
// are already paid for, so switching between them costs nothing. Only the cover is recomposed, which is
// compute-only.
//
// The write records source: 'creator', and that is the load-bearing part: the ranking pass checks it and
// leaves a creator-chosen frame alone. Human choice outranks generated choice until explicitly reset.

const BodySchema = z.object({
  reelId: z.string().uuid(),
  assetId: z.string().uuid(),
})

export async function POST(req: NextRequest) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { reelId, assetId } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), columns: { id: true, cover: true } })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The frame must belong to THIS reel and be an image — don't let an arbitrary id be pointed in, and
  // don't composite another tenant's asset onto this cover. 404 rather than 403, so a foreign id is not
  // confirmed to exist.
  const asset = await db.query.assets.findFirst({
    where: and(eq(assets.id, assetId), eq(assets.reelId, reelId), eq(assets.kind, 'image')),
  })
  if (!asset) return NextResponse.json({ error: 'Frame not found for this reel' }, { status: 404 })

  // Keep the existing shortlist so the picker still has its recommendations (and their reasons) to show
  // after an override; only the pick and its provenance change.
  const existing = ReelCoverSchema.safeParse(reel.cover)
  const cover: ReelCover = {
    frameAssetId: assetId,
    source: 'creator',
    shortlist: existing.success ? existing.data.shortlist : [],
    sampled: existing.success ? existing.data.sampled : 0,
    total: existing.success ? existing.data.total : 0,
  }
  await db.update(reels).set({ cover, updatedAt: new Date() }).where(eq(reels.id, reelId))

  // Rebuild the cover from the newly chosen frame. Free and takes seconds; the video is untouched.
  try {
    await enqueueStep({ reelId, stepName: 'compose_cover' })
  } catch (err) {
    console.warn(`[set-cover-frame] cover rebuild not queued for ${reelId.slice(0, 8)}: ${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json({ ok: true, coverRebuilding: false, coverRebuildQueueFailed: true })
  }
  return NextResponse.json({ ok: true, coverRebuilding: true })
}
