import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, channels, reels } from '@reels/db'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { generateImage, generateImageFal, imageEngineForGenre, FLUX_IMAGE_ENGINE, ContentFilterError, ProviderRateLimitError, llmCall, SCENE_IMAGE_QUALITY } from '@reels/providers'
import { assembleImagePrompt, assembleReferencePrompt, assembleNegativePrompt, castNationality, reelLightingDirective, sceneEntities, slug, StoryBibleSchema, PLATFORM_PRESETS } from '@reels/core'
import { buildReviseScenePrompt, REVISE_SCENE_V1_VERSION, ReviseSceneSchema } from '@reels/core/prompts/revise-scene.v1'
import { buildFilterSafePrompt, FILTER_SAFE_V1_VERSION, FilterSafeSchema } from '@reels/core/prompts/filter-safe.v1'
import { requireReelOwner, callerMayUseStorageKey, requireSpendBudget } from '@/lib/api-access'

export async function POST(req: NextRequest) {
  // `instruction` = an optional plain-language change ("lights off", "make them talk while walking"); it's
  // turned into a proper image prompt by the LLM below, never fed to the image model raw.
  // mode: 'vary' (default) conditions on the CURRENT image so the regen stays close (fix a hand, small
  // variation); 'fresh' ignores the current image and re-rolls a new composition from scratch. Both keep the
  // character/location plates so faces stay consistent. instruction is optional (a plain re-roll needs none).
  // anchor: how strongly an operator-attached reference (referenceKey) leads the render. Set by the
  // AI-grounded feedback options (see grounded-feedback.v1) so a 📎 attachment is no longer just the weakest
  // extra reference. Unset → legacy behaviour (attachment added last, current image dominates).
  const { reelId, sceneIdx, instruction, mode, referenceKey, anchor } = (await req.json().catch(() => ({}))) as {
    reelId: string; sceneIdx: number; instruction?: string; mode?: 'vary' | 'fresh'; referenceKey?: string
    anchor?: 'current-first' | 'reference-first' | 'reference-only'
  }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  // A 📎 attachment is fed to the image model server-side — don't let it reference another tenant's asset.
  if (referenceKey && !(await callerMayUseStorageKey(gate, referenceKey))) {
    return NextResponse.json({ error: 'Invalid reference image' }, { status: 400 })
  }
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

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

  // Bill the reel as each call is made, not once at the end. A "fresh take" that changes a character's look
  // can spend a revise LLM + a re-minted plate + a filter-safe LLM on top of the scene image, and every
  // error path below returns early — so a single trailing increment charged one image for up to four calls.
  // Atomic because the storyboard invites concurrent regens.
  const addSpend = async (cents: number): Promise<void> => {
    if (!(cents > 0)) return
    await db
      .update(reels)
      .set({ costCents: sql`${reels.costCents} + ${cents}`, updatedAt: new Date() })
      .where(eq(reels.id, reelId))
  }

  // A plain-language change goes through the LLM first, NOT straight into the image model — it bakes the
  // change into a well-formed, content-only image prompt (same conventions scenes.v1 produces).
  const tweak = instruction?.trim()
  let contentPrompt = basePrompt
  // reviseReplace: the reviser flagged a fundamentally different shot — a NEW subject/figure/viewpoint that
  // must render from scratch (image-to-image can't add someone). We then drop the current-image reference.
  // A change that only MODIFIES what's already in the frame stays a vary (edits the current image in place).
  let reviseReplace = false
  // Set only on a FRESH TAKE that edits a recurring CHARACTER's permanent look: update the bible + re-mint
  // its plate GLOBALLY, then flag her other scenes to refresh. A plain vary tweak stays LOCAL (edits this
  // image) and must never redefine the character everywhere. Returned to the UI.
  let entityLook: { entityId: string; affectedSceneIdxs: number[] } | null = null
  if (tweak) {
    try {
      const sceneEnts = storyBible
        ? sceneEntities(storyBible, { primaryEntity: scene.primaryEntity, supportingEntities: scene.supportingEntities }).map((e) => ({ id: e.id, description: e.description }))
        : []
      const { system, userMessage } = buildReviseScenePrompt(basePrompt, tweak, { genreCategory: channel.genreCategory, entities: sceneEnts, aspect })
      const revised = await llmCall({ templateVersion: REVISE_SCENE_V1_VERSION, schema: ReviseSceneSchema, system, messages: [{ role: 'user', content: userMessage }] })
      await addSpend(revised.costCents)
      contentPrompt = revised.data.imagePrompt.trim() || basePrompt
      reviseReplace = revised.data.intent === 'replace'

      // GLOBAL character-look change fires on a FRESH TAKE only; in vary the same instruction edits THIS
      // image locally (so reverting to an image and tweaking a character keeps that image's character).
      const look = mode === 'fresh' ? revised.data.entityLook : null
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
          await addSpend(plateRes.costCents) // a second full image generation, previously uncharged
          ent.referenceImageKey = plateRes.asset.storageKey
        } catch { /* keep old plate; description still updated */ }
        await db.update(reels).set({ storyBible }).where(eq(reels.id, reelId))
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
  // anchor 'reference-only' also drops the current image — the attachment renders fresh (a full replace).
  const dropCurrent = mode === 'fresh' || reviseReplace || anchor === 'reference-only'
  const currentImage = !dropCurrent && scene.imageAssetId
    ? await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
    : null
  // Vary/tweak: the DISPLAYED image is the identity source — condition on it ALONE, not the entity plates.
  // A plate that has drifted to a different look would otherwise override what you see and swap the character
  // (the bug behind "revert to an image, tweak it, get a different woman"). Fresh/replace has no current
  // image, so it injects identity from the entity plates instead.
  const baseRefs = currentImage ? [currentImage.storageKey] : entityPlateKeys
  // An operator-attached reference image (📎). `anchor` (from the AI-grounded feedback options) decides how
  // strongly it leads — ordering matters, the FIRST image is weighted most by the edit model:
  //   reference-only  → the attachment ALONE (full replace; current image already dropped above)
  //   reference-first → attachment leads, current image / plates follow (strong adoption)
  //   current-first / unset → attachment appended last as a nudge (legacy default: keep the current shot)
  let referenceImageKeys: string[]
  if (!referenceKey) referenceImageKeys = baseRefs
  else if (anchor === 'reference-only') referenceImageKeys = [referenceKey]
  else if (anchor === 'reference-first') referenceImageKeys = [referenceKey, ...baseRefs]
  else referenceImageKeys = [...baseRefs, referenceKey]

  // Write each regen to a UNIQUE key so previous images survive (the pipeline overwrites one shared key; if
  // regens did too, undo/redo would have nothing to go back to). This is what makes image history possible.
  const outKey = `reels/${reelId}/scenes/${sceneIdx}/image-${Date.now()}.webp`
  const render = (prompt: string) => engine.family === 'openai'
    ? generateImage({ prompt, negativePrompt, reelId, sceneIdx, storageKey: outKey, quality: SCENE_IMAGE_QUALITY, aspect, ...(referenceImageKeys.length ? { referenceImageKeys } : {}) })
    : generateImageFal({ prompt, negativePrompt, reelId, sceneIdx, storageKey: outKey, aspect, ...(referenceImageKeys.length ? { referenceImageKeys } : {}), engine })

  let result
  try {
    result = await render(finalPrompt)
  } catch (err) {
    // Filter-safe retry: on a safety-filter rejection, rewrite the prompt (a dead / menacing / supernatural
    // PERSON → "a figure") and try ONCE more — so Regenerate / Fresh take / older person-worded prompts
    // self-heal without the operator rewording. Only fires on rejection, so no cost on the happy path.
    if (err instanceof ContentFilterError) {
      try {
        const { system, userMessage } = buildFilterSafePrompt(finalPrompt)
        const safe = await llmCall({ templateVersion: FILTER_SAFE_V1_VERSION, schema: FilterSafeSchema, system, messages: [{ role: 'user', content: userMessage }] })
        await addSpend(safe.costCents)
        result = await render(safe.data.imagePrompt.trim() || finalPrompt)
      } catch (err2) {
        if (err2 instanceof ProviderRateLimitError) return NextResponse.json({ error: 'Image service is busy — wait a moment and try again.' }, { status: 429 })
        return NextResponse.json({ error: 'The image was rejected by the safety filter — try rewording your change.' }, { status: 422 })
      }
    } else if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Image service is busy — wait a moment and try again.' }, { status: 429 })
    } else {
      return NextResponse.json({ error: 'Image generation failed — try again.' }, { status: 502 })
    }
  }
  const provider = engine.family === 'openai' ? 'openai' : 'fal'
  // Charged here, before the asset/scene bookkeeping below — those are three more DB writes that can
  // throw, and the image is the most expensive call in this route.
  await addSpend(result.costCents)

  const [asset] = await db.insert(assets).values({
    reelId,
    channelId: channel.id,
    kind: 'image',
    storageKey: result.asset.storageKey,
    provider,
    costCents: result.costCents,
    // Store the prompt that made this image, so undo/redo can restore it alongside the picture — then a
    // later tweak varies THIS image with a matching prompt instead of a stale, drifted one.
    meta: { ...result.asset.meta, visualPrompt: contentPrompt },
  }).returning()

  // A new image invalidates the OLD clip (it was animated from the previous image) — the stale clips are
  // deleted below. But PRESERVE the scene's tier: a motion/hero beat (tier "video") stays video and
  // re-animates from this new image at the next render, instead of silently dropping to a static still and
  // never regaining motion (the bug behind "hero scenes aren't in motion" after a re-roll). A "still" beat
  // stays still. Persist the rewritten description so later regens build on it.
  const descChanged = contentPrompt !== scene.visualPrompt
  await db.update(scenes)
    .set({ imageAssetId: asset!.id, ...(descChanged ? { visualPrompt: contentPrompt } : {}) })
    .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))

  const reelVideos = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
  const staleIds = reelVideos.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
  if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))

  // entityLook (when the change edited a character's look): the UI flags the other scenes she's in so the
  // operator can refresh them to match — "update globally, refresh on demand".
  return NextResponse.json({ ok: true, storageKey: result.asset.storageKey, entityLook })
}
