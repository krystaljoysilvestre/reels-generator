import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes, assets } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

// Undo/redo: re-point a scene to one of its PREVIOUSLY generated images. Every regen keeps its old image
// assets, so this just swaps which one the scene uses — no regeneration, no cost. The client walks the
// scene's image history (ordered by createdAt) and posts the target assetId.
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, sceneIdx, assetId } = (await req.json()) as { reelId: string; sceneIdx: number; assetId: string }
  const db = getDb()

  // The asset must belong to THIS reel and be an image (don't let an arbitrary id be pointed in).
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.reelId, reelId), eq(assets.kind, 'image')) })
  if (!asset) return NextResponse.json({ error: 'Image not found for this reel' }, { status: 404 })

  await db.update(scenes)
    .set({ imageAssetId: assetId, tier: 'still' }) // a swapped still image invalidates any motion clip
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  return NextResponse.json({ ok: true, storageKey: asset.storageKey })
}
