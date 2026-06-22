import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, channels, reels } from '@reels/db'
import { eq, and, inArray } from 'drizzle-orm'
import { generateImage, FalEngineSchema } from '@reels/providers'
import { assembleImagePrompt, assembleNegativePrompt } from '@reels/core'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, sceneIdx } = (await req.json()) as { reelId: string; sceneIdx: number }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)),
  })
  const channel = reel ? await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }) : null
  if (!scene || !channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!scene.visualPrompt) return NextResponse.json({ error: 'No visual prompt' }, { status: 400 })

  const finalPrompt = assembleImagePrompt(scene.visualPrompt, channel.stylePreset)
  // Match generate-images: scene images render on flux/dev for palette + detail fidelity (style spike).
  const engine = FalEngineSchema.parse({ imageModelId: 'fal-ai/flux/dev' })

  const result = await generateImage({
    prompt: finalPrompt,
    negativePrompt: assembleNegativePrompt(),
    reelId,
    sceneIdx,
    engine,
    guidanceScale: 3.5,
    numInferenceSteps: 28,
  })

  const [asset] = await db.insert(assets).values({
    reelId,
    channelId: channel.id,
    kind: 'image',
    storageKey: result.asset.storageKey,
    provider: 'fal',
    costCents: result.costCents,
    meta: result.asset.meta,
  }).returning()

  // A new image invalidates any motion: the clip was animated from the OLD image. So reset the scene to a
  // still (Motion toggle off) and discard the stale clips. The operator flips Motion back on to re-animate
  // the fresh image. `isHero` is left intact — the scene is still a designated key beat.
  await db.update(scenes)
    .set({ imageAssetId: asset!.id, tier: 'still' })
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  const reelVideos = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const staleIds = reelVideos.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
  if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))

  // Accumulate cost
  if (reel) {
    await db.update(reels).set({ costCents: reel.costCents + result.costCents, updatedAt: new Date() }).where(eq(reels.id, reelId))
  }

  return NextResponse.json({ ok: true, storageKey: result.asset.storageKey })
}
