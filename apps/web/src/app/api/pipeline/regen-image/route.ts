import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, channels, reels } from '@reels/db'
import { eq, and, inArray } from 'drizzle-orm'
import { generateImage, generateImageFal, imageEngineForGenre, FLUX_IMAGE_ENGINE, ContentFilterError, ProviderRateLimitError, llmCall, SCENE_IMAGE_QUALITY } from '@reels/providers'
import { assembleImagePrompt, assembleReferencePrompt, assembleNegativePrompt, castNationality, reelLightingDirective, sceneEntities, slug, StoryBibleSchema, PLATFORM_PRESETS } from '@reels/core'
import { buildReviseScenePrompt, REVISE_SCENE_V1_VERSION, ReviseSceneSchema } from '@reels/core/prompts/revise-scene.v1'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // `instruction` = an optional plain-language change ("lights off", "make them talk while walking"); it's
  // turned into a proper image prompt by the LLM below, never fed to the image model raw.
  // mode: 'vary' (default) conditions on the CURRENT image so the regen stays close (fix a hand, small
  // variation); 'fresh' ignores the current image and re-rolls a new composition from scratch. Both keep the
  // character/location plates so faces stay consistent. instruction is optional (a plain re-roll needs none).
  const { reelId, sceneIdx, instruction, mode } = (await req.json()) as {
    reelId: string; sceneIdx: number; instruction?: string; mode?: 'vary' | 'fresh'
  }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)),
  })
  const channel = reel ? await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }) : null
  if (!scene || !channel || !reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 'fresh' re-rolls the shot as first written, so it starts from the pristine scenes-generation prompt
  // (visualPromptBase) — NOT the visualPrompt that "vary + instruction" regens have been accumulating into.
  // 'vary' keeps building on the current (possibly-revised) prompt. Fall back to visualPrompt for pre-migration
  // scenes that have no frozen base.
  const basePrompt = (
    (mode === 'fresh' ? scene.visualPromptBase || scene.visualPrompt : scene.visualPrompt) || ''
  ).trim()
  if (!basePrompt) return NextResponse.json({ error: 'No visual prompt' }, { status: 400 })

  // Engine + look context up-front, so an entity-look change can re-mint that character's plate BEFORE we
  // render the scene off it. Same engine/plates as the pipeline → the reshoot stays consistent with the reel.
  const storyBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null
  const engine = imageEngineForGenre(channel.genreCategory)
  const aspect = (PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all).aspect
  const lighting = storyBible ? reelLightingDirective(channel.genreCategory, storyBible.continuity.timeline) : undefined
  const cast = castNationality(channel.languages, (channel.worldBible as { region?: string } | null)?.region)
  const negativePrompt = assembleNegativePrompt({ genreCategory: channel.genreCategory })

  // A plain-language change goes through the LLM first, NOT straight into the image model — it bakes the
  // change into a well-formed, content-only image prompt (same conventions scenes.v1 produces).
  const tweak = instruction?.trim()
  let contentPrompt = basePrompt
  // reviseReplace: the reviser flagged a fundamentally different shot (new subject/viewpoint/figure) OR an
  // entity-look change — either way we must NOT condition on the current image (the reference would clamp it).
  let reviseReplace = false
  // Set when the change edits a recurring CHARACTER's permanent look: we update the bible + re-mint its plate
  // GLOBALLY (so she stays consistent everywhere), then flag her other scenes to refresh. Returned to the UI.
  let entityLook: { entityId: string; affectedSceneIdxs: number[] } | null = null
  if (tweak) {
    try {
      const sceneEnts = storyBible
        ? sceneEntities(storyBible, { primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities }).map((e) => ({ id: e.id, description: e.description }))
        : []
      const { system, userMessage } = buildReviseScenePrompt(basePrompt, tweak, { genreCategory: channel.genreCategory, entities: sceneEnts })
      const revised = await llmCall({ templateVersion: REVISE_SCENE_V1_VERSION, schema: ReviseSceneSchema, system, messages: [{ role: 'user', content: userMessage }] })
      contentPrompt = revised.data.imagePrompt.trim() || basePrompt
      reviseReplace = revised.data.intent === 'replace'

      const look = revised.data.entityLook
      const ent = look && storyBible ? storyBible.entities.find((e) => e.id === look.entityId) : undefined
      if (look && ent) {
        // Update the canonical look + re-mint the plate GLOBALLY (threat → Flux so it isn't beautified). A
        // failed plate keeps the old one — the description still updates.
        ent.description = look.description.trim() || ent.description
        const plateEngine = channel.genreCategory === 'horror' && ent.role === 'threat' ? FLUX_IMAGE_ENGINE : engine
        try {
          const platePrompt = assembleReferencePrompt(ent, channel.stylePreset, lighting, cast)
          const plateKey = `reels/${reelId}/refs/${slug(ent.id)}.webp`
          const plateRes = plateEngine.family === 'openai'
            ? await generateImage({ prompt: platePrompt, negativePrompt, reelId, sceneIdx, storageKey: plateKey, quality: SCENE_IMAGE_QUALITY, aspect })
            : await generateImageFal({ prompt: platePrompt, negativePrompt, reelId, sceneIdx, storageKey: plateKey, aspect, engine: plateEngine })
          ent.referenceImageKey = plateRes.asset.storageKey
        } catch { /* keep old plate; description still updated */ }
        await db.update(reels).set({ storyBible }).where(eq(reels.id, reelId))
        reviseReplace = true // her look changed — render this scene fresh off the new plate
        const allScenes = await db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) })
        const affectedSceneIdxs = allScenes
          .filter((s) => s.idx !== sceneIdx && (s.primaryEntity === ent.id || (s.supportingEntities ?? []).includes(ent.id)))
          .map((s) => s.idx)
        entityLook = { entityId: ent.id, affectedSceneIdxs }
      }
    } catch {
      return NextResponse.json({ error: 'Could not apply your change — try rephrasing it.' }, { status: 502 })
    }
  }

  const expansion = storyBible
    ? { bible: storyBible, primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities }
    : undefined
  const finalPrompt = assembleImagePrompt(contentPrompt, channel.stylePreset, expansion, lighting, cast)
  const entityPlateKeys = storyBible
    ? sceneEntities(storyBible, { primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities })
        .map((e) => e.referenceImageKey)
        .filter((k): k is string => Boolean(k))
    : []
  // 'vary' (default): put the CURRENT image first as the reference so the regen stays close to it (a small
  // fix keeps the composition). 'fresh': omit it → a new composition, plates-only. Faces stay locked either way.
  const currentImage = mode !== 'fresh' && !reviseReplace && scene.imageAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
    : null
  const referenceImageKeys = [...(currentImage ? [currentImage.storageKey] : []), ...entityPlateKeys]

  // Write each regen to a UNIQUE key so previous images survive (the pipeline overwrites one shared key; if
  // regens did too, undo/redo would have nothing to go back to). This is what makes image history possible.
  const outKey = `reels/${reelId}/scenes/${sceneIdx}/image-${Date.now()}.webp`

  let result
  try {
    result = engine.family === 'openai'
      ? await generateImage({ prompt: finalPrompt, negativePrompt, reelId, sceneIdx, storageKey: outKey, quality: SCENE_IMAGE_QUALITY, aspect, ...(referenceImageKeys.length ? { referenceImageKeys } : {}) })
      : await generateImageFal({ prompt: finalPrompt, negativePrompt, reelId, sceneIdx, storageKey: outKey, aspect, ...(referenceImageKeys.length ? { referenceImageKeys } : {}), engine })
  } catch (err) {
    if (err instanceof ContentFilterError) {
      return NextResponse.json({ error: 'The image was rejected by the safety filter — try rewording your change.' }, { status: 422 })
    }
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Image service is busy — wait a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Image generation failed — try again.' }, { status: 502 })
  }
  const provider = engine.family === 'openai' ? 'openai' : 'fal'

  const [asset] = await db.insert(assets).values({
    reelId,
    channelId: channel.id,
    kind: 'image',
    storageKey: result.asset.storageKey,
    provider,
    costCents: result.costCents,
    meta: result.asset.meta,
  }).returning()

  // A new image invalidates any motion (the clip was animated from the OLD image): reset to a still and drop
  // the stale clips. Persist the rewritten description so later regens build on it.
  const descChanged = contentPrompt !== scene.visualPrompt
  await db.update(scenes)
    .set({ imageAssetId: asset!.id, tier: 'still', ...(descChanged ? { visualPrompt: contentPrompt } : {}) })
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  const reelVideos = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const staleIds = reelVideos.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
  if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))

  await db.update(reels).set({ costCents: reel.costCents + result.costCents, updatedAt: new Date() }).where(eq(reels.id, reelId))

  // entityLook (when the change edited a character's look): the UI flags the other scenes she's in so the
  // operator can refresh them to match — "update globally, refresh on demand".
  return NextResponse.json({ ok: true, storageKey: result.asset.storageKey, entityLook })
}
