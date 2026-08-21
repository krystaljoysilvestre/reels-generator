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
  const { eq, and, inArray, sql } = await import('drizzle-orm')
  const { generateImageFal, imageEngineForGenre } = await import('@reels/providers')
  const { AppearanceBindingsSchema, assembleImagePrompt, assembleNegativePrompt, conditionableReferenceKeys, reelLightingDirective, sceneEntities, StoryBibleSchema, channelPlatformPreset, effectiveGenre } =
    await import('@reels/core')

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })
  const channel = reel ? await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }) : null
  if (!reel || !scene || !channel) throw new Error('reel/scene/channel not found')

  const storyBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null
  const appearanceByEntity = AppearanceBindingsSchema.parse(scene.appearanceBindings ?? {})
  const expansion = storyBible
    ? { bible: storyBible, primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities, appearanceByEntity }
    : undefined
  // The reel's FROZEN genre, not the channel's current one: this re-renders ONE scene back into an
  // existing reel, so it must use the same engine/lighting/guards the reel's other scenes were made
  // with. Reading the channel here would silently mismatch a regenerated scene against its siblings.
  const genre = effectiveGenre(reel, channel)
  const engine = imageEngineForGenre(genre)
  const aspect = channelPlatformPreset(channel).aspect
  const lighting = storyBible ? reelLightingDirective(genre, storyBible.continuity.timeline) : undefined
  // 'fresh' re-rolls from the pristine scenes-generation prompt; 'vary' builds on the current (revised) one.
  const basePrompt = mode === 'fresh' ? scene.visualPromptBase || scene.visualPrompt : scene.visualPrompt
  const finalPrompt = assembleImagePrompt((basePrompt || '').trim(), channel.stylePreset, expansion, lighting)
  const negativePrompt = assembleNegativePrompt({ genreCategory: genre })

  const entityPlateKeys = storyBible
    ? conditionableReferenceKeys(sceneEntities(storyBible, { primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities, appearanceByEntity }))
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

  // Bill first, atomically. This used to be a read-modify-write (`reel.costCents + result.costCents`) at the
  // very end, against a row read minutes earlier — the whole fal render sat inside that window, so any
  // concurrent pipeline or route increment was silently overwritten.
  await db.update(reels)
    .set({ costCents: sql`${reels.costCents} + ${result.costCents}`, updatedAt: new Date() })
    .where(eq(reels.id, reelId))

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

  console.log(`Done → ${result.asset.storageKey}. Reload the storyboard.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
