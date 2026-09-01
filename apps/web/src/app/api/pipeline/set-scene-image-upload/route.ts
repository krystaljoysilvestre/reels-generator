import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, channels, reels } from '@reels/db'
import { eq, and, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { requireReelOwner, callerMayUseStorageKey, reelIdFromKey } from '@/lib/api-access'

const InputSchema = z.object({
  reelId: z.string().uuid(),
  sceneIdx: z.number().int().nonnegative(),
  key: z.string().min(1),
})

// "Upload image for this scene": use an operator-uploaded image (key from scene-image-upload) directly AS
// the scene's image — no generation. We register it as an image asset (so it joins undo/redo history) and
// point the scene at it. A new still invalidates any motion clip, same as a reshoot.
export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const { reelId, sceneIdx, key } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  // Don't let a scene point at another tenant's reels/ object.
  if (reelIdFromKey(key) !== reelId || !(await callerMayUseStorageKey(gate, key))) {
    return NextResponse.json({ error: 'Invalid image' }, { status: 400 })
  }

  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })
  const channel = reel ? await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }) : null
  if (!reel || !scene || !channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [asset] = await db.insert(assets).values({
    reelId, channelId: channel.id, kind: 'image', storageKey: key, provider: 'upload', costCents: 0,
    meta: { uploaded: true, uploadedByUserId: gate.id },
  }).returning()

  await db.update(scenes)
    // An operator upload has no verified external provenance payload. Clear any stale archival origin from
    // the previous image rather than crediting/disclosing the replacement as that old source.
    .set({ imageAssetId: asset!.id, imageOrigin: null, tier: 'still' }) // a swapped still invalidates motion
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  // Drop this scene's stale video (it was animated off the old image).
  const vids = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const stale = vids.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
  if (stale.length) await db.delete(assets).where(inArray(assets.id, stale))

  return NextResponse.json({ ok: true, storageKey: key })
}
