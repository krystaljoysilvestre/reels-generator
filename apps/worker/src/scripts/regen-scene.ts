// One-off: regenerate a single scene image the same way the storyboard "Regenerate" button does.
// mode 'vary' (default) conditions on the CURRENT image + face plates so it stays close (fix small things);
// 'fresh' re-rolls a new composition. Writes to a UNIQUE key so the take is preserved for Undo/Redo.
//
//   ./apps/worker/node_modules/.bin/tsx apps/worker/src/scripts/regen-scene.ts <reelId> <sceneIdx> [vary|fresh]

import { config } from 'dotenv'
import { resolve } from 'node:path'

config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const reelId = process.argv[2]
  const sceneIdx = Number(process.argv[3])
  const mode = (process.argv[4] as 'vary' | 'fresh') ?? 'vary'
  if (!reelId || Number.isNaN(sceneIdx)) throw new Error('Usage: regen-scene.ts <reelId> <sceneIdx> [vary|fresh]')

  const { getDb, scenes, assets, channels, reels } = await import('@reels/db')
  const { eq, and, inArray } = await import('drizzle-orm')
  const { generateImageFal, imageEngineForGenre } = await import('@reels/providers')
  const { assembleImagePrompt, assembleNegativePrompt, reelLightingDirective, sceneEntities, StoryBibleSchema, PLATFORM_PRESETS } =
    await import('@reels/core')

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })
  const channel = reel ? await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }) : null
  if (!reel || !scene || !channel) throw new Error('reel/scene/channel not found')

  const storyBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null
  const expansion = storyBible
    ? { bible: storyBible, primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities }
    : undefined
  const engine = imageEngineForGenre(channel.genreCategory)
  const aspect = (PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all).aspect
  const lighting = storyBible ? reelLightingDirective(channel.genreCategory, storyBible.continuity.timeline) : undefined
  const finalPrompt = assembleImagePrompt((scene.visualPrompt || '').trim(), channel.stylePreset, expansion, lighting)
  const negativePrompt = assembleNegativePrompt({ genreCategory: channel.genreCategory })

  const entityPlateKeys = storyBible
    ? sceneEntities(storyBible, { primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities })
        .map((e) => e.referenceImageKey)
        .filter((k): k is string => Boolean(k))
    : []
  const currentImage = mode !== 'fresh' && scene.imageAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
    : null
  const referenceImageKeys = [...(currentImage ? [currentImage.storageKey] : []), ...entityPlateKeys]

  const outKey = `reels/${reelId}/scenes/${sceneIdx}/image-${Date.now()}.webp`
  console.log(`Regenerating scene ${sceneIdx} (${mode}) with ${referenceImageKeys.length} reference image(s)…`)

  const result = await generateImageFal({
    prompt: finalPrompt, negativePrompt, reelId, sceneIdx, storageKey: outKey, aspect,
    ...(referenceImageKeys.length ? { referenceImageKeys } : {}), engine,
  })

  const [asset] = await db.insert(assets).values({
    reelId, channelId: channel.id, kind: 'image', storageKey: result.asset.storageKey,
    provider: 'fal', costCents: result.costCents, meta: result.asset.meta,
  }).returning()

  await db.update(scenes).set({ imageAssetId: asset!.id, tier: 'still' })
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  // Drop any stale motion clip animated off the old image.
  const reelVideos = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const staleIds = reelVideos.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
  if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))

  await db.update(reels).set({ costCents: reel.costCents + result.costCents, updatedAt: new Date() }).where(eq(reels.id, reelId))
  console.log(`Done → ${result.asset.storageKey}. Reload the storyboard.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
