import { eq, and, sql } from 'drizzle-orm'
import { getDb, reels, scenes, assets, channels, stories } from '@reels/db'
import { generateImage, generateImageFal, imageEngineForGenre, FLUX_IMAGE_ENGINE, buildInputHash, ContentFilterError, llmCall, downloadBuffer, uploadBuffer, sourcePlaceImage, SCENE_IMAGE_MODEL, SCENE_IMAGE_QUALITY, type ImageEngine } from '@reels/providers'
import { assembleImagePrompt, assembleNegativePrompt, assembleReferencePrompt, castNationality, reelLightingDirective, sceneEntities, slug, PLATFORM_PRESETS, StoryBibleSchema } from '@reels/core'
import { z } from 'zod'
import { buildRephrasePrompt, REPHRASE_V1_VERSION, buildImageQAPrompt, IMAGE_QA_V1_VERSION, ImageQASchema, buildFilterSafePrompt, FILTER_SAFE_V1_VERSION, FilterSafeSchema, buildPlaceSourceDecidePrompt, buildPlaceVerifyPrompt, PlaceSourceDecisionSchema, PlaceVerifySchema, PLACE_SOURCE_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// generate_images — step 4
// One image per scene. Style preset injected server-side — the system owns the look, the LLM only writes
// scene content. Two render paths:
//  • Scenes that feature a bible entity WITH a reference plate → reference-conditioned edit on fal
//    (Gemini 2.5 Flash Image): the entity's plate(s) are passed as image_urls so the recurring ghost/house
//    keeps its pixel-level identity across scenes (the visual half of the continuity guarantee).
//  • Every other scene (no bible, or no plate for its entities) → text-to-image via OpenAI gpt-image-1,
//    exactly as before. Same-`location` continuity there stays prompt-driven (the SETTING rule).
// Content-filter rejection → rephrase.v1 retry (max 3) → mood-only downgrade.
// HERO (tier:'video') + PEAK scenes additionally get a vision QA pass that re-rolls when the render clearly
// contradicts the brief (open door, third-person instead of POV, a figure shown when it should be implied).
// QA improves rather than gates — a reel is never failed on a verdict.

const MAX_REPHRASE_ATTEMPTS = 3

// Scene-image render recipe (model + quality) is the shared SCENE_IMAGE_* recipe from @reels/providers, so
// scene generation, in-editor regenerate, and the onboarding style previews all render identically — what
// the operator approves at creation is what their scenes look like.
const IMAGE_CONCURRENCY = 4
const IMAGE_QA_MODEL = 'claude-haiku-4-5-20251001' // vision QA runs on Claude (the QA provider) — cheap + sees images
// hero/peak scenes get ONE extra attempt on a QA fail — a cheap hedge against a transient miss (an
// occasional open door, a one-off bad roll). Verified empirically: re-rolling a *systematic* image-model
// limit (POV-with-figure, shadow-under-closed-door) never converges, so more attempts just burn cost. When QA
// still fails, the image is kept and the verdict is flagged on meta.qaIssues for the operator to act on.
const MAX_QA_REROLLS = 1

// The reflective surfaces where a FIRST-PERSON narrator's own FACE can appear on screen. These are the ONLY
// beats where her locked look must be spliced/conditioned (see the visibility rule in processScene) — on
// every other first-person beat she's the unseen camera, and splicing her full description draws a
// third-person figure of her facing the lens (the #1 POV failure). Kept deliberately tight (the proven set)
// so an incidental "phone screen"/"glass of water" doesn't wrongly pull her face into a shot.
const NARRATOR_FACE_SURFACE = /\b(mirror|reflection|reflected|glass)\b/i

// Claude vision (QA) needs the real media_type; sniff it from magic bytes rather than trusting the
// stored extension (the generated format isn't guaranteed to match the .webp key).
function sniffMediaType(buf: Buffer): 'image/webp' | 'image/jpeg' | 'image/png' {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  return 'image/jpeg'
}

// Run `worker` over items with a rolling pool of `concurrency` runners (each pulls the next item as it
// frees — no head-of-line blocking). Per-item errors are collected, not fatal: successful scenes still
// persist; if any failed we throw at the end so runStep's retry resumes only the still-pending scenes.
async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  const failures: string[] = []
  let next = 0
  const runner = async () => {
    while (next < items.length) {
      const i = next++
      try {
        await worker(items[i]!)
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err))
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runner))
  if (failures.length > 0) {
    throw new Error(`${failures.length}/${items.length} scene image(s) failed: ${failures.join(' | ')}`)
  }
}

// Render one image on the chosen engine — gpt-image-1 (openai) via ../../providers generateImage, or a fal
// model (gemini/flux) via generateImageFal. Both take/return the same shape, so callers stay engine-agnostic.
async function renderImage(
  engine: ImageEngine,
  params: { prompt: string; negativePrompt: string; reelId: string; sceneIdx?: number; storageKey?: string; aspect: string; referenceImageKeys?: string[] },
): Promise<Awaited<ReturnType<typeof generateImageFal>>> {
  // TEXT-TO-IMAGE ONLY for gpt-image-1 (its edit/reference conditioning proved unreliable — ignored wardrobe,
  // flipped gender); fal engines take reference plates. One dispatch, reused for the filter-safe retry below.
  const dispatch = (prompt: string) =>
    engine.family === 'openai'
      ? generateImage({ prompt, negativePrompt: params.negativePrompt, reelId: params.reelId, sceneIdx: params.sceneIdx ?? 0, quality: SCENE_IMAGE_QUALITY, aspect: params.aspect, ...(params.storageKey ? { storageKey: params.storageKey } : {}) })
      : generateImageFal({ prompt, negativePrompt: params.negativePrompt, reelId: params.reelId, aspect: params.aspect, engine, ...(params.sceneIdx !== undefined ? { sceneIdx: params.sceneIdx } : {}), ...(params.storageKey ? { storageKey: params.storageKey } : {}), ...(params.referenceImageKeys?.length ? { referenceImageKeys: params.referenceImageKeys } : {}) })
  try {
    return await dispatch(params.prompt)
  } catch (err) {
    // Filter-safe retry: a safety-filter rejection → rewrite the prompt (a dead / menacing / supernatural
    // PERSON → "a figure") and try ONCE more, so a plate/scene from an older person-worded prompt self-heals
    // instead of failing. Only on rejection → no cost on the happy path.
    if (!(err instanceof ContentFilterError)) throw err
    const { system, userMessage } = buildFilterSafePrompt(params.prompt)
    const safe = await llmCall({ templateVersion: FILTER_SAFE_V1_VERSION, schema: FilterSafeSchema, system, messages: [{ role: 'user', content: userMessage }] })
    return dispatch(safe.data.imagePrompt.trim() || params.prompt)
  }
}

// ── FACTUAL real-place sourcing ─────────────────────────────────────────────────────────────────────────
// Fill a real, named PLACE's reference plate with a REAL licensed photograph (Wikimedia Commons) instead of a
// generated one — informational genre only. Two guards keep it honest: an LLM decides the location is a
// specific, named place worth sourcing (a generic setting — a bedroom, a street — falls through to a
// generated plate), and a vision check confirms the sourced photo actually depicts it. Never throws (fails
// soft to {sourced:false}); the Wikimedia fetch is free, the two small QA calls are cost-accounted by the
// caller. On success the real photo becomes the entity's plate, so the normal reference-conditioning path
// renders every scene of that place from the real building.
const PLACE_SOURCE_MODEL = 'claude-haiku-4-5-20251001'
const PLACE_VERIFY_MIN_CONFIDENCE = 0.6

type PlateSourceResult =
  | { sourced: true; key: string; origin: { type: 'sourced'; provider: string; url: string; license: string; author: string }; costCents: number }
  | { sourced: false; costCents: number }

async function sourceLocationPlate(entity: { id: string; description: string }, reelId: string, region: string | undefined): Promise<PlateSourceResult> {
  let costCents = 0
  try {
    // The bible entity id IS the place name in kebab-case (e.g. "paoay-church"); de-kebab it so the decider
    // judges by the NAME, not only the feature-list description (which often doesn't name the place).
    const name = entity.id.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')
    // 1) Specific, real, named place worth sourcing? (skip generic settings) + best search query.
    const dp = buildPlaceSourceDecidePrompt(name, entity.description, region)
    const decide = await llmCall({ templateVersion: PLACE_SOURCE_V1_VERSION, schema: PlaceSourceDecisionSchema, provider: 'anthropic', model: PLACE_SOURCE_MODEL, system: dp.system, messages: [{ role: 'user', content: dp.userMessage }] })
    costCents += decide.costCents
    const query = (decide.data.query ?? '').trim()
    if (!decide.data.sourceable || !query) return { sourced: false, costCents }

    // 2) Find a licence-clean photo of it (free API; null → fall through to a generated plate).
    const img = await sourcePlaceImage(query)
    if (!img) return { sourced: false, costCents }

    // 3) Confidence FILTER — does the photo actually depict the described place? (catches obvious mismatches).
    const vp = buildPlaceVerifyPrompt(name, entity.description)
    const verify = await llmCall({
      templateVersion: PLACE_SOURCE_V1_VERSION, schema: PlaceVerifySchema, provider: 'anthropic', model: PLACE_SOURCE_MODEL,
      system: vp.system,
      messages: [{ role: 'user', content: [{ type: 'image', mediaType: img.mime, base64: img.buffer.toString('base64') }, { type: 'text', text: vp.userMessage }] }],
    })
    costCents += verify.costCents
    if (!verify.data.matches || verify.data.confidence < PLACE_VERIFY_MIN_CONFIDENCE) return { sourced: false, costCents }

    // The key stays .webp regardless of the real bytes — every downstream reader sniffs magic bytes, not the
    // extension (see sniffMediaType / fal refDataUri), so the real jpeg/png conditions scenes identically.
    const key = `reels/${reelId}/refs/${slug(entity.id)}.webp`
    await uploadBuffer(key, img.buffer, img.mime)
    return { sourced: true, key, origin: { type: 'sourced', provider: 'wikimedia', url: img.sourceUrl, license: img.license, author: img.author }, costCents }
  } catch (err) {
    console.warn(`[generate-images] real-place sourcing failed for "${entity.id}": ${err instanceof Error ? err.message : String(err)}`)
    return { sourced: false, costCents }
  }
}

export async function generateImages(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)

  const [reelScenes, channel, story] = await Promise.all([
    db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
    reel.storyId ? db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }) : Promise.resolve(undefined),
  ])
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)

  // Story Bible (from analyze_story). null = not analyzed → assembleImagePrompt falls back to the plain
  // style+content form (pre-bible behavior). When present, each scene's entity refs expand to the bible's
  // frozen canonical descriptions, spliced identically across scenes (see specs/story-bible.md).
  const storyBible = reel.storyBible ? StoryBibleSchema.parse(reel.storyBible) : null

  // Generate at the channel's platform aspect (9:16 reels; 16:9 long-form) so scene images fill the frame.
  const aspect = (PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all).aspect

  // Reel-level lighting (from the bible's time-of-day cues). Forces night/darkness into every scene + every
  // location/object plate so a night story stops rendering in daylight. undefined for non-night reels.
  const lighting = storyBible ? reelLightingDirective(channel.genreCategory, storyBible.continuity.timeline) : undefined

  // Image model is chosen per genre (currently gpt-image-1 for all — owner preference). Used for both
  // reference plates and scenes so the whole reel renders on one engine.
  const imageEngine = imageEngineForGenre(channel.genreCategory)

  // Cast nationality from the channel's language (region as fallback) — locked into both the character
  // plates and every scene so the cast matches the channel's audience instead of the model's default look.
  const region = (channel.worldBible as { region?: string } | null)?.region
  const cast = castNationality(channel.languages, region)

  // Lazy reference plates: mint ONE plate per entity the SCENES actually reference (and that lacks one),
  // then persist. Done HERE — not in analyze_story — so we never pay for plates on entities the story
  // doesn't use (channel-canon noise), and never render anything before the operator approves the cast at
  // the gate. Idempotent: a retry skips entities that already have a key. Mutates `storyBible` in place so
  // the per-scene assembly below sees the new keys.
  // gpt-image-1 (openai) renders text-to-image only (its reference conditioning corrupts identity — see
  // renderImage), so don't pay to mint plates it won't use. fal engines (gemini/flux) DO use them.
  if (storyBible && imageEngine.family !== 'openai') {
    const referenced = new Set<string>()
    for (const s of reelScenes) {
      if (!s.visualPrompt) continue
      for (const e of sceneEntities(storyBible, { primaryEntity: s.primaryEntity, supportingEntities: s.supportingEntities })) referenced.add(slug(e.id))
    }
    const refNeg = assembleNegativePrompt({ genreCategory: channel.genreCategory })
    let plateCost = 0
    await Promise.all(
      storyBible.entities.map(async (entity) => {
        if (entity.referenceImageKey || !referenced.has(slug(entity.id))) return
        try {
          // FACTUAL genre: for a real, named PLACE, try a REAL sourced photograph before inventing one. A
          // generic setting, or a failed / low-confidence source, falls through to the generated plate below.
          if (channel.genreCategory === 'informational' && entity.kind === 'location') {
            const sourced = await sourceLocationPlate(entity, reelId, region)
            plateCost += sourced.costCents
            if (sourced.sourced) { entity.referenceImageKey = sourced.key; entity.referenceOrigin = sourced.origin; return }
          }
          // The supernatural threat mints on the grittier Flux engine for horror — Gemini beautifies faces,
          // sanding the dread off the scare. Every other entity uses the channel's normal engine.
          const plateEngine = channel.genreCategory === 'horror' && entity.role === 'threat' ? FLUX_IMAGE_ENGINE : imageEngine
          const res = await renderImage(plateEngine, { prompt: assembleReferencePrompt(entity, channel.stylePreset, lighting, cast), negativePrompt: refNeg, reelId, storageKey: `reels/${reelId}/refs/${slug(entity.id)}.webp`, aspect })
          entity.referenceImageKey = res.asset.storageKey
          plateCost += res.costCents
        } catch (err) {
          console.warn(`[generate-images] ${reelId.slice(0, 8)} reference plate failed for "${entity.id}": ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
    )
    if (plateCost > 0) await db.update(reels).set({ storyBible, costCents: sql`${reels.costCents} + ${plateCost}`, updatedAt: new Date() }).where(eq(reels.id, reelId))
  }

  const pending = reelScenes.filter((s) => s.visualPrompt && !s.imageAssetId) // skip already-generated (idempotency)

  // QA targets: the hero (tier:'video') beats + the peak scene, PLUS any scene that features a PERSON —
  // where the model can invent an extra, swap the narrator's identity, or render a static camera-facing pose
  // (the CAST + static checks in image-qa.v1.1 catch these, but only if the scene is QA'd). Pure-environment
  // stills stay unQA'd to keep cost bounded. A person is "featured" when the scene tags a character entity or
  // names a person in its prose.
  const peak = story?.twistAnchor?.trim() ?? ''
  const characterIds = new Set((storyBible?.entities ?? []).filter((e) => e.kind === 'character').map((e) => slug(e.id)))
  const PERSON_NOUN = /\b(boy|man|men|woman|women|girl|child|children|kid|figure|hand|hands|person|people|bystander|stranger|guard|nurse|doctor|teacher|classmate|friend)\b/i
  const featuresPerson = (s: (typeof pending)[number]) => {
    const refs = [...(s.primaryEntity ? [s.primaryEntity] : []), ...(s.supportingEntities ?? [])]
    return refs.some((r) => characterIds.has(slug(r))) || PERSON_NOUN.test(s.visualPrompt ?? '')
  }
  const isQATarget = (s: (typeof pending)[number]) => s.tier === 'video' || (peak !== '' && s.narrationText.includes(peak)) || featuresPerson(s)

  const processScene = async (scene: (typeof pending)[number]) => {
    // FIRST-PERSON NARRATOR VISIBILITY — decide the narrator's splice HERE, deterministically, from whether
    // her FACE is on-screen, NOT from the breakdown's tags (which mark her "present" on nearly every POV
    // beat). In a first-person reel she IS the camera; splicing her full character description into a POV
    // shot is exactly what makes the model render a third-person figure of her staring into the lens (the
    // dominant POV failure). Her face only ever appears in a reflective surface (see NARRATOR_FACE_SURFACE),
    // so re-add her ONLY on those beats — to lock her look for the payoff — and strip her (from both the tag
    // and any reference plate) everywhere else. This ONE visibility rule replaces the old scare-beat
    // narrator-drop AND the reflection special-case: a "reflection reveal" is simply the one beat where her
    // face is visible, nothing categorically special. (Third-person reels skip this — there she's a shown
    // character, tagged and spliced normally.)
    const narratorId = storyBible?.continuity.narratorEntityId ?? null
    const firstPerson = storyBible?.continuity.narratorPerspective === 'first_person'
    const narratorFaceShown = NARRATOR_FACE_SURFACE.test(`${scene.visualPrompt ?? ''} ${scene.sceneIntent ?? ''}`)
    let refPrimary = scene.primaryEntity
    let refSupporting = scene.supportingEntities ?? []
    if (firstPerson && narratorId) {
      const isNarrator = (id: string) => slug(id) === slug(narratorId)
      if (refPrimary && isNarrator(refPrimary)) refPrimary = null
      refSupporting = refSupporting.filter((id) => !isNarrator(id))
      if (narratorFaceShown) refSupporting = [...refSupporting, narratorId]
    }

    // Entities this scene features (narrator suppressed for reference PLATES via sceneEntities, the same
    // resolver the prompt assembler uses), resolved from the visibility-adjusted refs above so a POV beat
    // neither splices the narrator's description NOR conditions on her plate (both would draw her figure).
    // Non-empty plate set → reference-conditioned edit on fal; empty → text-to-image. Entities without a
    // minted plate simply don't contribute a reference.
    const sceneEnts = storyBible
      ? sceneEntities(storyBible, { primaryEntity: refPrimary, supportingEntities: refSupporting })
      : []
    const referenceImageKeys = sceneEnts.map((e) => e.referenceImageKey).filter((k): k is string => Boolean(k))

    // One engine for every scene, scare beats included. The gpt-image-1 scare-beat special-case existed
    // because the old fully-detailed corpse-face archetype needed moderation:'low' to render at all — and it
    // still refused intermittently, collapsing the payoff to a fallback. The chiaroscuro threat archetype
    // (story-analyzer.v1.15: shadow-native form + ONE lit anomaly) is tame to moderation by construction, so
    // the reveal renders on the reel's default engine like everything else — reference-conditioned (the
    // narrator's + threat's plates lock both identities in the mirror), cheaper, zero refusals in the A/B
    // (2026-07-15, reel d86ccd48 scene 6: nano-banana first-try vs gpt-image-1 3-refusals→fallback).
    const sceneEngine = imageEngine

    // Server-side prompt assembly — the LLM never sees this. Style suffix + (when analyzed) the scene's bible
    // entities expanded to their frozen descriptions (narrator resolved by the visibility rule above).
    const expansion = storyBible
      ? { bible: storyBible, primaryEntity: refPrimary, supportingEntities: refSupporting }
      : undefined
    const finalPrompt = assembleImagePrompt(scene.visualPrompt!, channel.stylePreset, expansion, lighting, cast)
    const negativePrompt = assembleNegativePrompt({ genreCategory: channel.genreCategory })

    const inputHash = buildInputHash('generate_images.v1', {
      finalPrompt,
      sceneIdx: scene.idx,
      reelId,
      model: SCENE_IMAGE_MODEL,
      quality: SCENE_IMAGE_QUALITY, // in the hash so a recipe change busts the cache + regenerates
      referenceImageKeys, // re-render when a scene's references change (gained/lost a plate)
      engine: `${sceneEngine.imageModel}|${sceneEngine.editModel}`, // switching engine (incl. scare→Flux) busts the cache
    })

    // Per-scene step row (not the bare 'generate_images') so concurrent scenes don't collide on one
    // (reelId, stepName) ledger row — the collision hid failures from retry and stuck reels from the reaper.
    await runStep(
      { reelId, stepName: `generate_images:scene${scene.idx}` as never, inputHash },
      async (cost) => {
        const qa = isQATarget(scene)
        let chosen: Awaited<ReturnType<typeof generateImageWithRetry>> | undefined
        let extraNeg = '' // targeted negatives added across re-rolls to push the model off the flagged failure
        let lastIssues: string[] = [] // QA verdict of the kept image ([] = passed / not QA'd)
        // KEEP THE BEST ATTEMPT, not the last. Attempts overwrite the same storage key, so without this a
        // near-miss roll (failed QA on one nit) gets clobbered by a later, WORSE roll — observed live: a
        // reveal's attempt 0 drew the story's contradiction almost right, got re-rolled, and attempt 1 (a
        // studio portrait) was what shipped. Track each attempt's bytes + issue count and restore the best
        // after the loop when the final roll didn't win. Fewest QA issues = best (a pass is 0).
        let best: { buffer: Buffer; issues: string[]; attempt: number } | undefined

        // Each attempt re-generates (gpt-image-1 is non-deterministic, so a re-roll is a genuinely
        // different render) and overwrites the same storage key, so stopping at the first pass leaves the
        // passing image in place. Non-QA scenes generate exactly once.
        for (let attempt = 0; attempt <= (qa ? MAX_QA_REROLLS : 0); attempt++) {
          const result = await generateImageWithRetry({
            prompt: finalPrompt,
            negativePrompt: extraNeg ? `${negativePrompt}, ${extraNeg}` : negativePrompt,
            reelId,
            sceneIdx: scene.idx,
            aspect,
            mood: scene.mood,
            stylePreset: channel.stylePreset,
            genreCategory: channel.genreCategory,
            referenceImageKeys,
            engine: sceneEngine,
          })
          cost.add(result.costCents) // record spend the moment it's incurred, so a throw below doesn't lose it
          chosen = result

          if (!qa) break

          const buffer = await downloadBuffer(result.asset.storageKey)
          const { verdict, costCents } = await imageQA(buffer, scene.visualPrompt!)
          cost.add(costCents)
          lastIssues = verdict.issues
          if (!best || verdict.issues.length < best.issues.length) best = { buffer, issues: verdict.issues, attempt }
          if (verdict.pass) {
            lastIssues = []
            if (attempt > 0) console.log(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} passed on re-roll ${attempt}`)
            break
          }
          // Targeted re-roll: the dominant failure is the model rendering a full figure / third-person when
          // the brief wants POV. When QA flags that, add anti-third-person negatives so the re-roll has a
          // real shot at the viewpoint (a blind re-roll alone rarely fixes a systematic viewpoint miss).
          if (/third.person|full body|\bfigure\b|perspective|\bpov\b|eye.?line|looking down/i.test(verdict.issues.join(' '))) {
            extraNeg = 'third person, full body shot, visible person, figure in frame, camera looking down at a person'
          }
          const tag = attempt < MAX_QA_REROLLS ? 're-rolling' : 'keeping best attempt'
          console.warn(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} attempt ${attempt} failed → ${tag}: ${verdict.issues.join('; ')}`)
        }

        // The canonical key holds the LAST attempt's bytes; if an earlier attempt scored better (fewer QA
        // issues), restore its bytes so the kept image is the closest roll to the brief.
        if (qa && best && best.issues.length < lastIssues.length) {
          await uploadBuffer(chosen!.asset.storageKey, best.buffer, sniffMediaType(best.buffer))
          lastIssues = best.issues
          console.log(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} restored attempt ${best.attempt} (fewest issues: ${best.issues.length})`)
        }

        // Persist asset + link to scene. QA verdict rides on meta (qaPass / qaIssues) so a later storyboard
        // pass can flag "this hero shot may not match the brief" to the operator instead of it being silent.
        const meta = {
          ...(chosen!.asset.meta as Record<string, unknown>),
          visualPrompt: scene.visualPrompt, // store the prompt so undo/redo can restore it with the image
          ...(qa ? { qaPass: lastIssues.length === 0 } : {}),
          ...(lastIssues.length ? { qaIssues: lastIssues } : {}),
        }
        // Default scene-image key is constant per scene; a re-run (e.g. the rerender-images script clears
        // imageAssetId) upserts this row in place rather than colliding on the unique (reelId, storageKey).
        const [asset] = await db
          .insert(assets)
          .values({
            reelId,
            channelId: reel.channelId,
            kind: 'image',
            storageKey: chosen!.asset.storageKey,
            provider: chosen!.provider,
            costCents: cost.total,
            meta,
          })
          .onConflictDoUpdate({
            target: [assets.reelId, assets.storageKey],
            set: { provider: chosen!.provider, costCents: cost.total, meta, createdAt: new Date() },
          })
          .returning()

        await db
          .update(scenes)
          .set({ imageAssetId: asset!.id })
          .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, scene.idx)))

        return { output: { assetId: asset!.id }, costCents: cost.total }
      },
    )
  }

  // Rolling pool — fast without flooding fal, and one bad scene doesn't abort the others.
  await runPool(pending, IMAGE_CONCURRENCY, processScene)
}

// Vision QA: does the render match the brief's checkable intent? Takes the image BYTES (the caller
// downloads once and reuses the buffer for best-attempt tracking). Sniffs the real media type so it works
// regardless of fal's output format. Cheap (Haiku); only called on QA-target scenes.
async function imageQA(buf: Buffer, visualPrompt: string): Promise<{ verdict: z.infer<typeof ImageQASchema>; costCents: number }> {
  const { system, userMessage } = buildImageQAPrompt(visualPrompt)
  const r = await llmCall({
    templateVersion: IMAGE_QA_V1_VERSION,
    schema: ImageQASchema,
    provider: 'anthropic', // QA runs on Claude
    model: IMAGE_QA_MODEL,
    system,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', mediaType: sniffMediaType(buf), base64: buf.toString('base64') },
          { type: 'text', text: userMessage },
        ],
      },
    ],
  })
  return { verdict: r.data, costCents: r.costCents }
}

interface ImageGenAttemptParams {
  prompt: string
  negativePrompt: string
  reelId: string
  sceneIdx: number
  aspect: string
  mood: string[]
  stylePreset: string
  genreCategory: string
  // Reference plates for this scene's entities (the scene's depictable bible entities). Non-empty →
  // reference-conditioned; empty → plain text→image. Rendered on `engine` either way.
  referenceImageKeys: string[]
  engine: ImageEngine // per-genre image model (currently gpt-image-1 for all)
}

async function generateImageWithRetry(params: ImageGenAttemptParams) {
  let currentPrompt = params.prompt
  let refKeys = params.referenceImageKeys
  const provider: 'openai' | 'fal' = params.engine.family === 'openai' ? 'openai' : 'fal'
  let totalCost = 0

  for (let attempt = 0; attempt < MAX_REPHRASE_ATTEMPTS; attempt++) {
    try {
      const result = await renderImage(params.engine, {
        prompt: currentPrompt,
        negativePrompt: params.negativePrompt,
        reelId: params.reelId,
        sceneIdx: params.sceneIdx,
        aspect: params.aspect,
        referenceImageKeys: refKeys, // [] → plain text→image; non-empty → reference-conditioned
      })
      return { ...result, provider, costCents: result.costCents + totalCost }
    } catch (err) {
      if (!(err instanceof ContentFilterError)) throw err

      // rephrase.v1 retry [docs/04 §4.3]. The rephrase LLM often wraps its answer in an object
      // ({image_prompt|imagePrompt|prompt: "..."}) instead of a bare string; with a strict z.string() schema
      // that threw → the recoverable content-filter collapsed to the mood-only downgrade, which strips the
      // shot's framing/detail (the horror reveal ends up a generic dark blob). Accept either shape and unwrap
      // to the string so a filter-safe rephrase actually survives — critical for scare beats that trip the
      // filter on the threat's description but must keep their extreme-close framing.
      let rephrased: string | null = null
      try {
        const { system, userMessage } = buildRephrasePrompt(currentPrompt, { genreCategory: params.genreCategory })
        const rephrase = await llmCall({
          templateVersion: REPHRASE_V1_VERSION,
          schema: z.union([
            z.string(),
            z.object({ imagePrompt: z.string() }).transform((o) => o.imagePrompt), // the shape rephrase.v1.1 asks for
            z.object({ image_prompt: z.string() }).transform((o) => o.image_prompt),
            z.object({ prompt: z.string() }).transform((o) => o.prompt),
            z.object({ description: z.string() }).transform((o) => o.description), // observed fallback shape
          ]),
          system,
          messages: [{ role: 'user', content: userMessage }],
        })
        totalCost += rephrase.costCents
        rephrased = typeof rephrase.data === 'string' && rephrase.data.trim() ? rephrase.data : null
      } catch (e) {
        console.warn(`[rephrase] ${params.reelId.slice(0, 8)} scene${params.sceneIdx} rephrase failed → mood-only: ${e instanceof Error ? e.message : String(e)}`)
      }

      if (rephrased && attempt < MAX_REPHRASE_ATTEMPTS - 1) {
        // Got a softened rewrite and still have an attempt left → try it next iteration.
        currentPrompt = rephrased
      } else {
        // Rephrase failed, OR this was the final attempt → mood-only downgrade. Drop the (rejected) subject
        // but KEEP the channel style so the fallback still looks like the rest of the reel; drop the
        // references too so it's a clean text-to-image atmosphere plate, not reference-locked to the filtered
        // entity. Break out and RENDER it below — do NOT keep looping (a softened prompt that keeps getting
        // refused just burns attempts and never falls back).
        currentPrompt = assembleImagePrompt(
          `${params.mood.join(', ')} atmosphere, empty scene, abstract shapes, deep shadow, negative space`,
          params.stylePreset,
        )
        refKeys = []
        break
      }
    }
  }

  // All rephrase attempts were refused by the safety filter → currentPrompt is now the mood-only atmosphere
  // downgrade (abstract, subject-free). RENDER it rather than throwing: a scare beat that trips moderation
  // must degrade to a plain atmosphere plate, never fail the whole reel. (Previously the fallback prompt was
  // set on the final loop iteration but the loop exited before rendering it, so the scene crashed the step.)
  const fallback = await renderImage(params.engine, {
    prompt: currentPrompt,
    negativePrompt: params.negativePrompt,
    reelId: params.reelId,
    sceneIdx: params.sceneIdx,
    aspect: params.aspect,
    referenceImageKeys: refKeys,
  })
  console.warn(`[generate-images] ${params.reelId.slice(0, 8)} scene${params.sceneIdx} exhausted safety-filter rephrases → mood-only atmosphere fallback`)
  return { ...fallback, provider, costCents: fallback.costCents + totalCost }
}
