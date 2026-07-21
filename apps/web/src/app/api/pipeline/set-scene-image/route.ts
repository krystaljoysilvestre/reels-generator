import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes, assets } from '@reels/db'
import { eq, and } from 'drizzle-orm'
import { requireReelOwner } from '@/lib/api-access'

// Undo/redo: re-point a scene to one of its PREVIOUSLY generated images. Every regen keeps its old image
// assets, so this just swaps which one the scene uses — no regeneration, no cost. The client walks the
// scene's image history (ordered by createdAt) and posts the target assetId.
export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, assetId } = (await req.json().catch(() => ({}))) as { reelId: string; sceneIdx: number; assetId: string }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()

  // The asset must belong to THIS reel and be an image (don't let an arbitrary id be pointed in).
  const asset = await db.query.assets.findFirst({ where: and(eq(assets.id, assetId), eq(assets.reelId, reelId), eq(assets.kind, 'image')) })
  if (!asset) return NextResponse.json({ error: 'Image not found for this reel' }, { status: 404 })

  // Restore the prompt that made this image (stored in its meta at generation), so a later tweak varies
  // THIS image with a matching prompt — not the newest, drifted one. The displayed image is the source of
  // truth for both the picture and its prompt.
  const savedPrompt = (asset.meta as Record<string, unknown>)['visualPrompt']
  await db.update(scenes)
    .set({
      imageAssetId: assetId,
      tier: 'still', // a swapped still image invalidates any motion clip
      ...(typeof savedPrompt === 'string' && savedPrompt.trim() ? { visualPrompt: savedPrompt } : {}),
    })
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  return NextResponse.json({ ok: true, storageKey: asset.storageKey })
}
