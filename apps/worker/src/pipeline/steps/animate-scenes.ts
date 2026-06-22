import { eq, and } from 'drizzle-orm'
import { getDb, reels, scenes, assets } from '@reels/db'
import { generateVideo, buildInputHash, FalEngineSchema } from '@reels/providers'
import { runStep } from '../harness.js'

// animate_scenes — step 8 (docs/02 §4)
// tier=video scenes only. One clip per scene (render composites variationIdx 0). Model audio stripped
// at render. (Was 2 variations, but render only ever used v0 and there's no UI to pick the other — the
// second was pure waste, ~50¢/scene, so we generate just the one.)

export async function animateScenes(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)

  const videoScenes = (
    await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
  ).filter((s) => s.tier === 'video' && s.imageAssetId)

  const engine = FalEngineSchema.parse({})

  for (const scene of videoScenes) {
    // Get the image asset storage key
    const imageAsset = await db.query.assets.findFirst({
      where: eq(assets.id, scene.imageAssetId!),
    })
    if (!imageAsset) continue

    const variationCount = 1  // one clip per scene; render composites variationIdx 0

    // Skip variations that already have a video asset — e.g. the operator pre-vetted this scene via the
    // storyboard's "Preview animation" button. Reuses that paid work instead of regenerating at render.
    const existing = await db.query.assets.findMany({
      where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')),
    })
    const haveVariation = new Set(
      existing
        .filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === scene.idx)
        .map((a) => (a.meta as Record<string, unknown>)['variationIdx']),
    )

    for (let v = 0; v < variationCount; v++) {
      if (haveVariation.has(v)) continue
      const inputHash = buildInputHash('animate_scenes.v1', {
        imageKey: imageAsset.storageKey,
        motionPrompt: scene.motionPrompt ?? '',
        variationIdx: v,
        reelId,
        sceneIdx: scene.idx,
      })

      await runStep(
        { reelId, stepName: 'animate_scenes', inputHash: `${inputHash}:s${scene.idx}v${v}` as never },
        async () => {
          const result = await generateVideo({
            imageStorageKey: imageAsset.storageKey,
            motionPrompt: scene.motionPrompt ?? 'slow cinematic drift',
            durationSec: 5,
            reelId,
            sceneIdx: scene.idx,
            variationIdx: v,
            engine,
          })

          await db.insert(assets).values({
            reelId,
            channelId: reel.channelId,
            kind: 'video',
            storageKey: result.asset.storageKey,
            provider: 'fal',
            providerJobId: result.providerJobId ?? null,
            costCents: result.costCents,
            meta: {
              ...result.asset.meta,
              sceneIdx: scene.idx,
              variationIdx: v,
              // Model audio is stripped in the render step — not here
            },
          })

          return { output: { storageKey: result.asset.storageKey }, costCents: result.costCents }
        },
      )
    }
  }
}
