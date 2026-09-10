import { eq, and } from 'drizzle-orm'
import { getDb, reels, scenes, assets, channels, stories, assertVisualTruthReady } from '@reels/db'
import { generateImage, generateImageFal, imageEngineForGenre, FLUX_IMAGE_ENGINE, buildInputHash, ContentFilterError, llmCall, downloadBuffer, uploadBuffer, sourceEntityImage, spendFromError, sniffImageMediaType, SCENE_IMAGE_MODEL, SCENE_IMAGE_QUALITY, type ImageEngine } from '@reels/providers'
import { archivalShotTarget, presentedSourceTarget, identityWithheldEntities, MODES_WITHOUT_PLATES, normalizeCanon, WorldBibleSchema, EntityPlateStoreSchema, entityDescriptionHash, assembleImagePrompt, assembleNegativePrompt, assembleReferencePrompt, castNationality, historicalEraDirective, reelLightingDirective, sceneEntities, slug, channelPlatformPreset, StoryBibleSchema, AppearanceBindingsSchema, appearanceIdForEntity, entityAtAppearance, resolveEntities, EBN_RENDERING_PROFILE, effectiveGenre, resolveChannelPolicy, requiresEvidence, canUseArchivalHumanShot, splitSceneDepiction, conditionableReferenceKeys, missingRequiredIdentityReferences, personNameVariants, mentionsAny, scrubNames, SAFE_REPRESENTATIVE_STAGING, visualTruthContractErrors, depictionRoutingIsCurrent, type BibleEntity, type CharacterAppearance, type DepictionRouting, type MediaOrigin, type DepictionBasis, type SourcePolicy } from '@reels/core'
import { z } from 'zod'
import { buildRephrasePrompt, REPHRASE_V1_VERSION, buildImageQAPrompt, IMAGE_QA_V1_VERSION, ImageQASchema, isBlockingImageTruthFailure, buildFilterSafePrompt, FILTER_SAFE_V1_VERSION, FilterSafeSchema, buildEntityVerifyPrompt, buildIdentityStateVerifyPrompt, buildRepresentativeStagingPrompt, EntityVerifySchema, IdentityStateVerifySchema, RepresentativeStagingSchema, PLATE_COLOURISE_PROMPT, ENTITY_SOURCE_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'
import { runPool } from '../pool.js'
import { routeDepiction } from '../depiction-routing.js'
import { resolveMediaGenre } from '@reels/core/prompts/scenes.v1'

// generate_images — step 4
// One image per scene. Style preset injected server-side — the system owns the look, the LLM only writes
// scene content. Two render paths:
//  • Scenes that feature a bible entity WITH a reference plate → reference-conditioned edit on fal
//    (Gemini 2.5 Flash Image): the entity's plate(s) are passed as image_urls so the recurring ghost/house
//    keeps its pixel-level identity across scenes (the visual half of the continuity guarantee).
//  • Every other scene (no bible, or no plate for its entities) → text-to-image on the configured scene
//    engine. Same-`location` continuity there stays prompt-driven (the SETTING rule).
// Content-filter rejection → rephrase.v1 retry (max 3) → mood-only downgrade.
// HERO (tier:'video') + PEAK scenes additionally get a vision QA pass that re-rolls when the render clearly
// contradicts the brief (open door, third-person instead of POV, a figure shown when it should be implied).
// Craft QA improves and flags; factual truth/identity QA blocks after the bounded re-roll is exhausted.

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

export function applyDepictionRouting(entity: BibleEntity, routing: DepictionRouting): void {
  const previousMode = entity.depiction?.depictionMode
  entity.depiction = routing
  // A classifier correction from exact real identity to generated context must not leave the old source
  // plate attached: conditionableReferenceKeys would otherwise keep using pixels that the new verdict
  // explicitly says do not represent this entity.
  if (previousMode === 'reference_plate' && routing.depictionMode !== 'reference_plate') {
    delete entity.referenceImageKey
    delete entity.referenceOrigin
    for (const appearance of entity.appearances ?? []) {
      delete appearance.referenceImageKey
      delete appearance.referenceOrigin
    }
  }
}

// Factual truth is a property of the reel's frozen Source Policy, not its creative genre. Keep the legacy
// informational enrollment for channels that predate Source Policy, while ensuring a factual commentary,
// horror, or any future genre cannot enter the evidence-backed story path and then bypass visual truth QA.
export function requiresVisualTruthQa(policy: SourcePolicy, mediaGenre: string): boolean {
  return requiresEvidence(policy) || mediaGenre === 'informational'
}

// The reflective surfaces where a FIRST-PERSON narrator's own FACE can appear on screen. These are the ONLY
// beats where her locked look must be spliced/conditioned (see the visibility rule in processScene) — on
// every other first-person beat she's the unseen camera, and splicing her full description draws a
// third-person figure of her facing the lens (the #1 POV failure). Kept deliberately tight (the proven set)
// so an incidental "phone screen"/"glass of water" doesn't wrongly pull her face into a shot.
const NARRATOR_FACE_SURFACE = /\b(mirror|reflection|reflected|glass)\b/i

// Render one image on the chosen engine — gpt-image-1 (openai) via ../../providers generateImage, or a fal
// model (gemini/flux) via generateImageFal. Both take/return the same shape, so callers stay engine-agnostic.
// `onSpend` reports the filter-safe rephrase LLM the instant it's billed. It has to be reported rather than
// folded into the return, because the path it runs on is a safety-filter rejection — and the retry render
// right after it can be rejected too, in which case this function throws and a folded total is lost.
async function renderImage(
  engine: ImageEngine,
  params: { prompt: string; negativePrompt: string; reelId: string; sceneIdx?: number; storageKey?: string; aspect: string; referenceImageKeys?: string[] },
  onSpend?: (cents: number) => void,
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
    if (onSpend) onSpend(safe.costCents)
    const retry = await dispatch(safe.data.imagePrompt.trim() || params.prompt)
    // Only fold when there's no sink to report to (the plate path, which sums the return value); otherwise
    // it was already recorded above and folding would charge it twice.
    return onSpend ? retry : { ...retry, costCents: retry.costCents + safe.costCents }
  }
}

// ── Depictive fidelity: routing + real-subject sourcing ─────────────────────────────────────────────────
// Fill a real subject's reference plate with a REAL licensed photograph (Wikimedia Commons) instead of a
// generated one — for a named place, object, or animal, and for a long-dead historical PERSON. Gated on the
// channel's Source Policy; every step fails soft to today's generated plate, so the worst case is "no better
// than before", never "confidently wrong". See specs/depictive-fidelity.md.
//
// The guards, in order: a decider classifies the SUBJECT and skips anything generic or fictional; for a human
// only, identity and death date are verified from STRUCTURED DATA before anything is downloaded; and a vision
// check confirms the photo actually depicts the subject. The Wikimedia/Wikidata fetches are free; the LLM
// calls are cost-accounted by the caller.
const DEPICTION_MODEL = 'claude-haiku-4-5-20251001'
const ENTITY_VERIFY_MIN_CONFIDENCE = 0.6
// A face gets a HIGHER bar than a building. The verify step is a filter against obvious mismatches and is
// documented as weak at wrong-but-similar — which for a person is the entire failure mode (a similar-looking
// stranger), and the consequence is a real human depicted as someone they are not.
const HUMAN_VERIFY_MIN_CONFIDENCE = 0.8
// Exact state adaptation is a bounded correctness repair, not creative option generation. Crossroads live
// verification produced two invalid precursor plates in a row; a third attempt is the smallest retry budget
// that avoids failing the whole board on that observed variance while still stopping deterministically.
const MAX_STATE_PLATE_ATTEMPTS = 3

// The bible entity id IS the subject name in kebab-case ("paoay-church", "jose-rizal"); de-kebab it so the
// decider judges by the NAME, not only the feature-list description (which often doesn't name the subject).
const entityName = (id: string) => id.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ')

// Search results are not identity verdicts. Non-human subjects get a small ordered candidate set so one
// misleading lead image (for example an article about an artwork instead of the issue that printed it)
// cannot end sourcing prematurely. Every distinct candidate still has to pass the same vision verifier.
export function sourceQueryCandidates(
  entity: { id: string; description: string },
  routing: Pick<DepictionRouting, 'query' | 'subjectClass'>,
): string[] {
  const name = entityName(entity.id)
  // Commons search can get worse when a precise title is padded with container/media nouns (live case:
  // "The Blind Man magazine May 1917 issue Fountain" returned generic periodicals, while the compact
  // "The Blind Man May 1917 Fountain" returned the exact issue-2 page). Keep both; verification decides.
  const compactQuery = routing.query.replace(/\b(?:magazine|issue|publication|document|photograph|photo|image|scan)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  const raw = routing.subjectClass === 'human'
    ? [routing.query]
    : [routing.query, compactQuery, name, `${name} ${entity.description}`]
  const seen = new Set<string>()
  return raw.map((value) => value.trim()).filter((value) => {
    const normalized = value.toLowerCase()
    if (!value || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function buildStateAdaptationPrompt(basePrompt: string, stateDescription: string): string {
  return `${basePrompt}\n\nIDENTITY-STATE LOCK: Preserve the source subject's identity-defining geometry, proportions, openings, rim/edge shape, components, and markings wherever the target state does not explicitly change them. TARGET STATE IS AUTHORITATIVE: render exactly its specified orientation, surface markings, labels, damage, destruction, deformation, and restoration. A source-state detail that is absent from or contradicts this target belongs to another moment and must not carry over. If the target explicitly requires breakup, fragmentation, collapse, dismantling, crushing, burning, or another form-changing state, do not keep the subject intact merely to preserve identity; apply that change plausibly while retaining recognizable subject/model-specific features in the surviving form. The finished reference MUST visibly satisfy this exact state: ${stateDescription}.`
}

// Invariant-2 text helpers (personNameVariants / mentionsAny / scrubNames / SAFE_REPRESENTATIVE_STAGING)
// live in @reels/core types/depiction.ts — pure, so the safety guarantee is unit-tested rather than buried
// in this step.

/**
 * Resolve HOW this entity may be depicted, BEFORE any image is fetched. Never throws — on any failure it
 * returns 'generated', which is the pre-existing behaviour for every entity.
 *
 * For a human this is the safety gate, and it runs in the order that matters: IDENTITY first (does a single
 * Wikipedia article with a Wikidata id say who this is?), then ELIGIBILITY (does P570 put them ≥100 years
 * dead?). They fail to different modes — see depictionModeForHuman. An unidentified person is never sourced
 * on ANY path, because "may be presented from a real photograph" must not be reachable by a name we could
 * not resolve.
 */
interface SourcedMedia {
  buffer: Buffer
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  origin: MediaOrigin
  appearsGrayscale: boolean
}

/**
 * Fetch + verify a real photograph for an already-routed subject. Returns null (fail soft) whenever anything
 * is missing, unverified, or below the confidence bar for its class.
 *
 * `usage` is stamped here because it decides what may happen to these bytes later: a conditioning reference
 * may be colourised, a presented archival photograph may never be touched.
 */
async function fetchVerifiedMedia(
  entity: { id: string; description: string },
  routing: DepictionRouting,
  usage: 'conditioning_reference' | 'presented_archival',
  query = routing.query,
): Promise<{ media: SourcedMedia | null; costCents: number }> {
  let costCents = 0
  try {
    const subjectClass = routing.subjectClass
    if (subjectClass === 'fictional' || subjectClass === 'generic' || !query) return { media: null, costCents }
    const isHuman = subjectClass === 'human'

    // A human's photo must come from the identity-anchored path only; a name-string match has no anchor.
    const name = entityName(entity.id)
    const seenSources = new Set<string>()
    for (const sourceQuery of sourceQueryCandidates(entity, routing)) {
      // Article lead first preserves the strongest non-human identity anchor. If vision rejects that exact
      // file, retry the SAME query against Commons directly before broadening the query: an article about a
      // publication commonly leads with its cover while the required issue/page exists as a separate file.
      // Humans deliberately never get this unanchored path.
      const searchModes = isHuman ? [false] : [false, true]
      for (const preferCommonsSearch of searchModes) try {
        const img = await sourceEntityImage(sourceQuery, { requireArticleIdentity: isHuman, preferCommonsSearch })
        if (!img || seenSources.has(img.sourceUrl)) continue
        seenSources.add(img.sourceUrl)
        const vp = buildEntityVerifyPrompt(subjectClass, name, entity.description)
        const verify = await llmCall({
          templateVersion: ENTITY_SOURCE_V1_VERSION, schema: EntityVerifySchema,
          provider: 'anthropic', model: DEPICTION_MODEL,
          system: vp.system,
          messages: [{ role: 'user', content: [{ type: 'image', mediaType: img.mime, base64: img.buffer.toString('base64') }, { type: 'text', text: vp.userMessage }] }],
        })
        costCents += verify.costCents
        const minConfidence = isHuman ? HUMAN_VERIFY_MIN_CONFIDENCE : ENTITY_VERIFY_MIN_CONFIDENCE
        if (!verify.data.matches || verify.data.confidence < minConfidence) {
          console.warn(`[generate-images] "${entity.id}" candidate "${img.title}" rejected by verify (matches=${verify.data.matches}, confidence=${verify.data.confidence} < ${minConfidence}; ${verify.data.note})`)
          continue
        }

        return {
          media: {
            buffer: img.buffer,
            mime: img.mime,
            appearsGrayscale: verify.data.appearsGrayscale ?? false,
            origin: {
              type: 'sourced', provider: 'wikimedia', usage, subjectClass,
              url: img.sourceUrl, license: img.license, licenseUrl: img.licenseUrl, author: img.author,
              articleUrl: img.articleUrl,
              ...(img.wikibaseItem ? { wikibaseItem: img.wikibaseItem } : {}),
            },
          },
          costCents,
        }
      } catch (candidateError) {
        console.warn(`[generate-images] source candidate "${sourceQuery}"${preferCommonsSearch ? ' (Commons search)' : ''} failed for "${entity.id}": ${candidateError instanceof Error ? candidateError.message : String(candidateError)}`)
      }
    }
    return { media: null, costCents }
  } catch (err) {
    console.warn(`[generate-images] sourcing failed for "${entity.id}": ${err instanceof Error ? err.message : String(err)}`)
    return { media: null, costCents }
  }
}

// No `costCents` on purpose: sourceEntityPlate bills through the `bill` sink as each call is paid, so a
// returned total would be either dead or double-added. Removing the field is what stops a future reader
// re-adding `bill(sourced.costCents)` at the call site.
type PlateSourceResult = { sourced: true; key: string; origin: MediaOrigin } | { sourced: false }

/**
 * Source this entity's reference PLATE from a real photograph. Only ever called for a subject whose routing
 * resolved to 'reference_plate'.
 *
 * A monochrome plate is colourised first: conditioning colour scenes on an archival black-and-white portrait
 * produces a grayscale-head-on-colour-body seam (spike-continuity, 2026-07-20). That is legitimate here and
 * ONLY here — these bytes are a conditioning input, never a frame shown to a viewer — so the origin keeps
 * BOTH keys, and the transform is named, rather than letting a colourised derivative claim to be the
 * untouched Wikimedia file.
 */
async function sourceEntityPlate(
  identityEntity: { id: string; description: string },
  renderEntity: { id: string; description: string },
  routing: DepictionRouting,
  reelId: string,
  engine: ImageEngine,
  bill: (cents: number) => void,
  state?: { id: string; prompt: string },
): Promise<PlateSourceResult> {
  if (routing.subjectClass === 'fictional' || routing.subjectClass === 'generic') return { sourced: false }
  // Verify the source against the PARENT identity. A state description can intentionally differ from the
  // surviving photograph (unsigned vs signed, intact vs damaged); verifying against that state would reject
  // the correct subject before the state-adaptation step gets a chance to do its job.
  const { media, costCents } = await fetchVerifiedMedia(identityEntity, routing, 'conditioning_reference')
  bill(costCents)
  if (!media) return { sourced: false }

  // The key stays .webp regardless of the real bytes — every downstream reader sniffs magic bytes, not the
  // extension (see sniffImageMediaType / fal refDataUri), so the real jpeg/png conditions scenes identically.
  const sourceKey = `reels/${reelId}/refs/${slug(identityEntity.id)}-source.webp`
  await uploadBuffer(sourceKey, media.buffer, media.mime)
  const origin: MediaOrigin = { ...media.origin, sourceAssetKey: sourceKey, conditioningAssetKey: sourceKey }

  // A materially different story-time state still belongs to this sourced identity, but the source pixels
  // must not dictate details from the wrong moment. Derive one state plate from the verified source, keeping
  // geometry/identity while applying only the bible's factual state description. Never fall back to the raw
  // wrong-state photo when adaptation fails: the caller's coverage gate will stop before scene spend.
  if (state) {
    if (engine.family === 'openai') return { sourced: false }
    for (let attempt = 0; attempt < MAX_STATE_PLATE_ATTEMPTS; attempt++) {
      try {
      const stateKey = `reels/${reelId}/refs/${slug(identityEntity.id)}--${slug(state.id)}.webp`
      const res = await renderImage(engine, {
        prompt: buildStateAdaptationPrompt(state.prompt, renderEntity.description),
        negativePrompt: '',
        reelId,
        storageKey: stateKey,
        aspect: 'auto',
        referenceImageKeys: [sourceKey],
      }, bill)
      bill(res.costCents)
      const rendered = await downloadBuffer(res.asset.storageKey)
      const verifyPrompt = buildIdentityStateVerifyPrompt(entityName(identityEntity.id), renderEntity.description)
      const verify = await llmCall({
        templateVersion: ENTITY_SOURCE_V1_VERSION,
        schema: IdentityStateVerifySchema,
        provider: 'anthropic',
        model: DEPICTION_MODEL,
        system: verifyPrompt.system,
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'IMAGE 1 — verified source identity:' },
          { type: 'image', mediaType: media.mime, base64: media.buffer.toString('base64') },
          { type: 'text', text: 'IMAGE 2 — generated state-adapted candidate:' },
          { type: 'image', mediaType: sniffImageMediaType(rendered), base64: rendered.toString('base64') },
          { type: 'text', text: verifyPrompt.userMessage },
        ] }],
      })
      bill(verify.costCents)
      if (!verify.data.identityPreserved || !verify.data.candidateMatchesTargetExactly || verify.data.confidence < ENTITY_VERIFY_MIN_CONFIDENCE) {
        console.warn(`[generate-images] adapted state "${renderEntity.id}:${state.id}" rejected by verify on attempt ${attempt + 1} (identity=${verify.data.identityPreserved}, target=${verify.data.candidateMatchesTargetExactly}, confidence=${verify.data.confidence}; ${verify.data.note})`)
        continue
      }
      return {
        sourced: true,
        key: res.asset.storageKey,
        origin: {
          ...origin,
          conditioningAssetKey: res.asset.storageKey,
          conditioningTransform: 'state_adapted',
        },
      }
      } catch (error) {
        bill(spendFromError(error))
        console.warn(
          `[generate-images] adapting "${renderEntity.id}" state "${state.id}" attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    return { sourced: false }
  }

  if (!media.appearsGrayscale || engine.family === 'openai') return { sourced: true, key: sourceKey, origin }

  try {
    const colourKey = `reels/${reelId}/refs/${slug(identityEntity.id)}-colour.webp`
    const res = await renderImage(engine, {
      prompt: PLATE_COLOURISE_PROMPT, negativePrompt: '', reelId, storageKey: colourKey,
      aspect: 'auto', referenceImageKeys: [sourceKey],
    }, bill)
    bill(res.costCents)
    return {
      sourced: true, key: res.asset.storageKey,
      origin: { ...origin, conditioningAssetKey: res.asset.storageKey, conditioningTransform: 'colorized' },
    }
  } catch (err) {
    // Colourisation is an improvement, not a requirement — a monochrome plate still holds identity.
    bill(spendFromError(err))
    console.warn(`[generate-images] colourising "${identityEntity.id}" plate failed → using the monochrome original: ${err instanceof Error ? err.message : String(err)}`)
    return { sourced: true, key: sourceKey, origin }
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
  const aspect = channelPlatformPreset(channel).aspect

  // Reel-level lighting (from the bible's time-of-day cues). Forces night/darkness into every scene + every
  // location/object plate so a night story stops rendering in daylight. undefined for non-night reels.
  // Genre is per-REEL since series (specs/channel-series.md). Resolve ONCE here; every use below reads
  // this, so a channel edit can never re-light, re-engine or re-gate an already-rendered reel.
  const genre = effectiveGenre(reel, channel)
  // What this reel may treat as REAL — the reel's FROZEN policy wins, so re-rendering an old reel can
  // never start sourcing real photos it was not made with. Replaces the old `genre === 'informational'`
  // gate, which tied a permission to a genre bucket: a folklore channel sits on `horror`, so it could
  // never source a real photo of a real place it was literally about, while every informational channel
  // got the permission whether or not its creator wanted it.
  const policy = resolveChannelPolicy(reel, null, channel)
  const truthQaRequired = requiresVisualTruthQa(
    policy,
    resolveMediaGenre({ storyMode: channel.storyMode, genreCategory: genre, niche: channel.nicheDescription }),
  )
  // A linked failed verdict is terminal until the scene is deliberately regenerated. This check runs
  // before reference sourcing or any image spend, so worker retries surface the same blocker for free.
  await assertVisualTruthReady(reelId)
  const lighting = storyBible ? reelLightingDirective(genre, storyBible.continuity.timeline) : undefined

  // Image model is chosen per genre (currently gpt-image-1 for all — owner preference). Used for both
  // reference plates and scenes so the whole reel renders on one engine.
  const imageEngine = imageEngineForGenre(genre)

  // Cast nationality from the channel's language (region as fallback) — locked into both the character
  // plates and every scene so the cast matches the channel's audience instead of the model's default look.
  const worldBible = WorldBibleSchema.parse(channel.worldBible ?? {})
  const region = worldBible.region
  const cast = castNationality(channel.languages, region)

  // EVIDENCE-BASED NARRATIVE: force the illustrative rendering profile, overriding whatever look the
  // channel was created with. This is the visual guardrail made structural — an EBN reel can NOT render
  // photoreal, so no synthetic image can be mistaken for authentic documentation. Applies to every scene
  // image AND every reference plate below. (specs/evidence-based-narrative.md.)
  const baseStyle = channel.storyMode === 'ebn' ? EBN_RENDERING_PROFILE : channel.stylePreset
  const eraContext = historicalEraDirective(worldBible.era, region)
  const effectiveStyle = [baseStyle, eraContext].filter(Boolean).join('. ')
  // Defense-in-depth: fail closed unless an EBN reel's resolved style AFFIRMATIVELY commands illustration
  // (leads illustrative AND explicitly rejects photo). Checking for the affirmation — not for photoreal
  // keywords — is robust to the profile's own negations ("clearly NOT a photograph") while still catching
  // both a forcing bypass (a photoreal channel style has no such affirmation) and a future mis-edit of
  // EBN_RENDERING_PROFILE to something photoreal, before it can ship a guardrail-violating render.
  //
  // SCOPE: this governs what we GENERATE. A genuine archival photograph presented as a shot is real media,
  // not synthesis, and is never measured against it — the guardrail exists so no SYNTHETIC image can be
  // mistaken for authentic documentation, and a real photograph is authentic documentation. Its honesty
  // obligation is licence attribution plus an accurate disclosure label, both handled elsewhere.
  if (channel.storyMode === 'ebn' && !(/illustrat/i.test(effectiveStyle) && /(not|never|no)\s+(a\s+)?photo/i.test(effectiveStyle))) {
    throw new Error(`[generate_images] EBN reel ${reelId.slice(0, 8)} resolved to a non-illustrative style — the visual guardrail requires illustration. Style: ${effectiveStyle.slice(0, 80)}`)
  }

  // Lazy reference plates: mint ONE plate per entity the SCENES actually reference (and that lacks one),
  // then persist. Done HERE — not in analyze_story — so we never pay for plates on entities the story
  // doesn't use (channel-canon noise), and never render anything before the operator approves the cast at
  // the gate. Idempotent: a retry skips entities that already have a key. Mutates `storyBible` in place so
  // the per-scene assembly below sees the new keys.
  // gpt-image-1 (openai) renders text-to-image only (its reference conditioning corrupts identity — see
  // renderImage), so don't pay to mint plates it won't use. fal engines (gemini/flux) DO use them.
  if (storyBible && imageEngine.family !== 'openai') {
    type PlateTarget = {
      parent: BibleEntity
      appearance: CharacterAppearance | null
      renderEntity: BibleEntity
      targetKey: string
    }
    const targetMap = new Map<string, PlateTarget>()
    for (const s of reelScenes) {
      // A plate is an input to image generation, so mint it only for a scene that actually needs an image
      // now. This matters after a Bible re-analysis: already-rendered scenes keep their pixels and must not
      // trigger a full cast re-plate when only one time-bound appearance is being repaired.
      if (!s.visualPrompt || s.imageAssetId) continue
      const appearanceByEntity = AppearanceBindingsSchema.parse(s.appearanceBindings ?? {})
      const { resolved } = resolveEntities(storyBible, {
        primaryEntity: s.primaryEntity,
        supportingEntities: s.supportingEntities,
      })
      for (const parent of resolved) {
        const appearanceId = appearanceIdForEntity(appearanceByEntity, parent)
        const appearance = appearanceId
          ? parent.appearances?.find((candidate) => slug(candidate.id) === slug(appearanceId)) ?? null
          : null
        const targetKey = `${slug(parent.id)}::${appearance ? slug(appearance.id) : 'base'}`
        targetMap.set(targetKey, { parent, appearance, renderEntity: entityAtAppearance(parent, appearance?.id), targetKey })
      }
    }
    const plateTargets = [...targetMap.values()]
    const referenced = new Set(plateTargets.map((target) => slug(target.parent.id)))
    const refNeg = assembleNegativePrompt({ genreCategory: genre })
    // ── Channel-level plate reuse (W2) ──────────────────────────────────────────────────────────
    // A RECURRING entity is minted once per channel and reused forever; a one-off story character is
    // still minted per reel. The difference is membership of the channel's canon, so compute that set
    // rather than tagging entities: an entity is channel-canon iff the channel's worldBible declares it.
    const canonIds = new Set(normalizeCanon(WorldBibleSchema.parse(channel.worldBible ?? {})).map((e) => slug(e.id)))
    const plateStore = EntityPlateStoreSchema.parse(channel.entityPlates ?? {})
    // Attach any plate this channel already owns BEFORE deciding what to mint. The description hash is
    // part of the match: editing an entity's description must re-mint rather than silently serve the old
    // look. A hit costs nothing and renders this reel from the same pixels as every previous episode.
    let reused = 0
    for (const e of storyBible.entities) {
      if (!canonIds.has(slug(e.id)) || e.referenceImageKey) continue
      const hit = plateStore[slug(e.id)]
      if (hit && hit.descriptionHash === entityDescriptionHash(e.description)) {
        e.referenceImageKey = hit.key
        if (hit.referenceOrigin) e.referenceOrigin = hit.referenceOrigin
        reused++
      }
    }
    if (reused > 0) console.log(`[generate-images] ${reelId.slice(0, 8)}: reused ${reused} channel entity plate(s) — not re-minted, not re-paid`)

    // ── Depiction routing ────────────────────────────────────────────────────────────────────────
    // Resolve HOW each referenced entity may be depicted, ONCE, before anything is sourced or rendered.
    // Everything downstream reads `entity.depiction` — no gate re-derives a mode from `kind`, and nothing
    // re-checks whether a person is alive.
    //
    // Runs over every REFERENCED entity, not just `toMint`: an entity holding a reused channel plate still
    // needs a mode, because the scene path consults it (a person may never be conditioned on even when a
    // plate exists from before). Cheap and idempotent — current-version routing is skipped; a stale decision
    // re-runs once under a new input hash, records that classifier cost, then becomes cacheable again.
    const needsRouting = storyBible.entities.filter((e) =>
      referenced.has(slug(e.id)) && !depictionRoutingIsCurrent(e.depiction, ENTITY_SOURCE_V1_VERSION),
    )
    if (needsRouting.length > 0) {
      const routeHash = buildInputHash('depiction_routing.v1', {
        reelId,
        templateVersion: ENTITY_SOURCE_V1_VERSION,
        entities: needsRouting.map((e) => `${slug(e.id)}|${e.kind}|${e.description}`).sort().join('\n'),
        policy: `${policy.realPlaces}|${policy.realPeople}`,
      })
      await runStep(
        { reelId, stepName: 'generate_images:depiction' as never, inputHash: routeHash },
        async (cost) => {
          let routeCost = 0
          await Promise.all(
            needsRouting.map(async (entity) => {
              const { routing, costCents } = await routeDepiction(entity, policy, region)
              if (costCents > 0) { routeCost += costCents; cost.add(costCents) }
              applyDepictionRouting(entity, routing)
            }),
          )
          await db.update(reels).set({ storyBible, updatedAt: new Date() }).where(eq(reels.id, reelId))
          const notable = needsRouting.filter((e) => e.depiction && e.depiction.depictionMode !== 'generated')
          if (notable.length > 0) {
            console.log(`[generate-images] ${reelId.slice(0, 8)}: depiction routing → ${notable.map((e) => `${e.id}=${e.depiction!.depictionMode}(${e.depiction!.subjectClass})`).join(', ')}`)
          }
          return { output: { routed: needsRouting.length }, costCents: routeCost }
        },
      )
    }

    // INVARIANT 1, at the source: an 'archival_only' entity is excluded from minting entirely, so it can
    // acquire neither a sourced plate nor a generated stand-in likeness. It is not "an entity we failed to
    // plate" — it is an entity that must never have one.
    // Every selected identity state owns exactly one plate. A variant is never flattened into a second
    // cast entity, and a scene never receives both its base and variant reference.
    const toMint = plateTargets.filter((target) => {
      const mode = target.parent.depiction?.depictionMode ?? 'generated'
      if (MODES_WITHOUT_PLATES.has(mode)) return false
      // A legacy/generated key does not fulfil a real-identity route. Re-source and overwrite it so an old
      // fallback cannot permanently suppress the verified anchor on retries.
      if (mode === 'reference_plate') return missingRequiredIdentityReferences([target.renderEntity]).length > 0
      return !target.renderEntity.referenceImageKey
    })
    // Plate minting runs INSIDE runStep. It was the one paid path in the pipeline that bypassed the budget
    // gates (assertBudget / assertUserBudget / the global daily kill-switch), and its spend was recorded by a
    // single update AFTER every plate had rendered — so a crash or DB failure mid-flight lost the whole run's
    // plate cost AND the in-memory keys, and the retry re-minted (re-paid for) plates already bought. The
    // sink now persists whatever landed before a throw. Idempotency still comes from the bible's per-entity
    // referenceImageKey: the hash is the set of entities still MISSING a plate, so a swallowed plate failure
    // retries on the next run instead of being cached away as done.
    if (toMint.length > 0) {
      const plateHash = buildInputHash('image_plates.v7', {
        reelId,
        templateVersion: ENTITY_SOURCE_V1_VERSION,
        // Depiction mode is IN the hash: a re-route (policy change, a subject reclassified) must re-mint
        // rather than serve a plate produced under the old mode.
        entities: toMint.map((target) => `${target.targetKey}|${target.parent.depiction?.depictionMode ?? 'generated'}|${target.renderEntity.description}`).sort().join('\n'),
        engine: `${imageEngine.imageModel}|${imageEngine.editModel}`,
      })
      await runStep(
        { reelId, stepName: 'generate_images:plates' as never, inputHash: plateHash },
        async (cost) => {
          let plateCost = 0
          // Bill each call the moment it's paid: plates render concurrently, so one entity's later failure
          // must not erase another's cost. (The harness bills the sink ONLY when fn throws, never alongside
          // the returned total — reporting to both is not a double-add.)
          const bill = (cents: number) => { if (cents > 0) { plateCost += cents; cost.add(cents) } }
          await Promise.all(
            toMint.map(async (target) => {
              const entity = target.renderEntity
              const persistReference = (key: string, origin?: MediaOrigin): void => {
                if (target.appearance) {
                  target.appearance.referenceImageKey = key
                  if (origin) target.appearance.referenceOrigin = origin
                } else {
                  target.parent.referenceImageKey = key
                  if (origin) target.parent.referenceOrigin = origin
                }
              }
              try {
                // DEPICTIVE FIDELITY: for a real, named subject — a place, object, animal, or long-dead
                // historical person — try a REAL sourced photograph before inventing one. Routing was
                // resolved above and stored on the entity; nothing here re-derives it from `kind`.
                //
                // INVARIANT 1: an 'archival_only' entity NEVER gets a plate. Its photograph may be shown as
                // a shot, but it may never condition a generated frame — that is the difference between
                // presenting real media and fabricating a likeness. `return` before any render, so such an
                // entity also never gets a GENERATED plate standing in for the person.
                if (target.parent.depiction?.depictionMode === 'archival_only') return
                if (target.parent.depiction?.depictionMode === 'reference_plate') {
                  const sourced = await sourceEntityPlate(
                    target.parent,
                    entity,
                    target.parent.depiction,
                    reelId,
                    imageEngine,
                    bill,
                    target.appearance
                      ? {
                          id: target.appearance.id,
                          prompt: assembleReferencePrompt(entity, effectiveStyle, lighting, cast),
                        }
                      : undefined,
                  )
                  if (sourced.sourced) { persistReference(sourced.key, sourced.origin); return }
                  // A specific real identity without a verified source must not silently mint an invented
                  // replacement. The pre-scene coverage gate below stops before any scene image spend and a
                  // later retry remains eligible to source again.
                  return
                }
                // The supernatural threat mints on the grittier Flux engine for horror — Gemini beautifies faces,
                // sanding the dread off the scare. Every other entity uses the channel's normal engine.
                const plateEngine = genre === 'horror' && target.parent.role === 'threat' ? FLUX_IMAGE_ENGINE : imageEngine
                // `bill` as onSpend: on a safety-filter rejection the rephrase LLM is paid BEFORE the retry
                // render, and that retry can itself throw — folding it into the return would lose it.
                const suffix = target.appearance ? `--${slug(target.appearance.id)}` : ''
                const res = await renderImage(plateEngine, { prompt: assembleReferencePrompt(entity, effectiveStyle, lighting, cast), negativePrompt: refNeg, reelId, storageKey: `reels/${reelId}/refs/${slug(entity.id)}${suffix}.webp`, aspect }, bill)
                persistReference(res.asset.storageKey)
                bill(res.costCents)
              } catch (err) {
                // This catch swallows the failure (a missing plate falls back to text-to-image), so it is the
                // last chance to record calls the provider paid for before throwing.
                bill(spendFromError(err))
                console.warn(`[generate-images] ${reelId.slice(0, 8)} reference plate failed for "${target.targetKey}": ${err instanceof Error ? err.message : String(err)}`)
              }
            }),
          )
          // Persist the minted keys even when some plates failed — the successes must never be re-paid.
          await db.update(reels).set({ storyBible, updatedAt: new Date() }).where(eq(reels.id, reelId))
          // Promote CHANNEL-CANON plates to the channel so the next reel reuses these exact pixels
          // instead of minting a fresh look. Re-read the row inside the write so a concurrent reel's
          // promotion isn't clobbered (two reels on one channel can mint different entities at once).
          const minted = toMint.filter((target) => !target.appearance && target.parent.referenceImageKey && canonIds.has(slug(target.parent.id)))
          if (minted.length > 0) {
            const fresh = await db.query.channels.findFirst({ where: eq(channels.id, channel.id), columns: { entityPlates: true } })
            const store = EntityPlateStoreSchema.parse(fresh?.entityPlates ?? {})
            for (const { parent: e } of minted) {
              store[slug(e.id)] = {
                key: e.referenceImageKey!,
                descriptionHash: entityDescriptionHash(e.description),
                ...(e.referenceOrigin ? { referenceOrigin: e.referenceOrigin } : {}),
              }
            }
            await db.update(channels).set({ entityPlates: store, updatedAt: new Date() }).where(eq(channels.id, channel.id))
            console.log(`[generate-images] ${reelId.slice(0, 8)}: promoted ${minted.length} plate(s) to channel canon`)
          }
          return {
            output: {
              minted: toMint.filter((target) => target.appearance ? target.appearance.referenceImageKey : target.parent.referenceImageKey).length,
            },
            costCents: plateCost,
          }
        },
      )
    }
  }

  const pending = reelScenes.filter((s) => s.visualPrompt && !s.imageAssetId) // skip already-generated (idempotency)

  const contractErrors = pending.flatMap((scene) => visualTruthContractErrors({
    depictionBasis: scene.depictionBasis as DepictionBasis,
    sourcePresentationEntity: scene.sourcePresentationEntity,
    primaryEntity: scene.primaryEntity,
  }).map((error) => `scene ${scene.idx}: ${error}`))
  if (contractErrors.length > 0) {
    throw new Error(`[visual-truth-gate] ${contractErrors.join(' | ')}`)
  }

  // VERIFIED IDENTITY COVERAGE — deterministic and pre-spend. The director has already decided which exact
  // entity/state is visible; code now guarantees every `reference_plate` claim reaches the renderer with its
  // sourced anchor. This intentionally does not infer tags from prose (the Crossroads lexical experiment
  // produced false positives on ordinary precursor urinals).
  if (storyBible) {
    const gaps = pending.flatMap((scene) => {
      const appearanceByEntity = AppearanceBindingsSchema.parse(scene.appearanceBindings ?? {})
      const entities = sceneEntities(storyBible, {
        primaryEntity: scene.primaryEntity,
        supportingEntities: scene.supportingEntities,
        appearanceByEntity,
      })
      return missingRequiredIdentityReferences(entities).map((entity) => `scene ${scene.idx}: ${entity.id}`)
    })
    if (gaps.length > 0) {
      throw new Error(
        `[generate_images] verified identity reference missing (${[...new Set(gaps)].join(', ')}); retry sourcing or correct the scene's entity/state binding before image spend`,
      )
    }
  }

  // QA targets: the hero (tier:'video') beats + the peak scene, PLUS any scene that features a PERSON —
  // where the model can invent an extra, swap the narrator's identity, or render a static camera-facing pose
  // (the CAST + static checks in image-qa.v1.1 catch these, but only if the scene is QA'd). Pure-environment
  // stills stay unQA'd to keep cost bounded. A person is "featured" when the scene tags a character entity or
  // names a person in its prose.
  const peak = story?.twistAnchor?.trim() ?? ''
  const characterIds = new Set((storyBible?.entities ?? []).filter((e) => e.kind === 'character').map((e) => slug(e.id)))
  // Person nouns + real-party ROLE nouns (depictive-ethics floor): a scene naming an official/executive/
  // politician must always reach image-QA (the REAL-PARTY FABRICATION check), not depend on luck — the
  // 2026-07-24 DTI-handshake scene only got QA'd because it happened to say "hands".
  const PERSON_NOUN = /\b(boy|man|men|woman|women|girl|child|children|kid|figure|hand|hands|person|people|bystander|stranger|guard|nurse|doctor|teacher|classmate|friend|official|officer|minister|senator|president|mayor|governor|executive|spokesperson|spokesman|delegate|politician|representative)\b/i
  const featuresPerson = (s: (typeof pending)[number]) => {
    const refs = [...(s.primaryEntity ? [s.primaryEntity] : []), ...(s.supportingEntities ?? [])]
    return refs.some((r) => characterIds.has(slug(r))) || PERSON_NOUN.test(s.visualPrompt ?? '')
  }
  // VOICEOVER reels: person-presence is the wrong risk signal — the load-bearing frames are the ones whose
  // narration carries a quantity/comparison (the model's weak spot: muddled comparisons, garbled data-viz),
  // and they're usually people-free, so they'd escape QA entirely. Target them by claim load instead
  // (digits + EN/Tagalog quantity/comparative words). See hypotheses/voiceover-perspective.md.
  const isVoiceover = storyBible?.continuity.narratorPerspective === 'voiceover'
  const CLAIM_LOAD = /\d|%|percent|porsyento|bilyon|milyon|libo|thousand|million|billion|\bkada\b|\bper\b|versus|\bvs\.?\b|kumpara|compared|higit|mas\s+(?:mataas|mababa|malaki|maliit|mahal|mura)|more than|less than|up to|hanggang/i
  const carriesClaim = (s: (typeof pending)[number]) => CLAIM_LOAD.test(s.narrationText)
  // A scene involving an 'archival_only' person ALWAYS reaches vision QA, so the floor's REAL-PARTY
  // FABRICATION check sees the pixels. The deterministic scrub below is the guarantee; this is the
  // defense-in-depth behind it, and it must not depend on the prose happening to match PERSON_NOUN.
  const archivalSlugs = new Set(
    (storyBible?.entities ?? []).filter((e) => MODES_WITHOUT_PLATES.has(e.depiction?.depictionMode ?? 'generated')).map((e) => slug(e.id)),
  )
  const featuresArchival = (s: (typeof pending)[number]) =>
    [...(s.primaryEntity ? [s.primaryEntity] : []), ...(s.supportingEntities ?? [])].some((r) => archivalSlugs.has(slug(r)))
  const isQATarget = (s: (typeof pending)[number]) => truthQaRequired || Boolean(eraContext) || s.tier === 'video' || (peak !== '' && s.narrationText.includes(peak)) || featuresPerson(s) || featuresArchival(s) || (isVoiceover && carriesClaim(s))

  const blockingTruthFailures: string[] = []

  const processScene = async (scene: (typeof pending)[number]) => {
    const appearanceByEntity = AppearanceBindingsSchema.parse(scene.appearanceBindings ?? {})
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

    // ── SCENE DEPICTION REQUIREMENTS ────────────────────────────────────────────────────────────────
    // Resolve what this scene needs BEFORE deciding how to fulfil it, rather than keying the media mode off
    // `primaryEntity`: a living person can be the significant depictive subject of a beat without being its
    // primary entity ("the monument stands behind them during the ceremony"), and welding a whole media mode
    // onto the primary tag would miss exactly that case.
    const allSceneEnts = storyBible
      ? sceneEntities(storyBible, { primaryEntity: refPrimary, supportingEntities: refSupporting, appearanceByEntity })
      : []
    const sceneDepiction = splitSceneDepiction(allSceneEnts)

    // INVARIANT 2 (structural half): strip 'archival_only' entities from the tag set entirely — BEFORE the
    // prompt is assembled — so neither their reference plate NOR their frozen description can reach a
    // generated frame. Descriptions splice verbatim into image prompts, so leaving the tag in place would
    // hand the model a likeness in prose even with the plate correctly withheld.
    // TAGGING IS NOT THE TRIGGER — BEING NAMED IS.
    //
    // The tagged set is only half the exposure. A withheld person can appear in a shot's PROSE without
    // being tagged at all ("Close-up of DTI officials shaking hands…" with no entity reference), and the
    // scene resolver only ever returns TAGGED ids — so keying the scrub off `sceneDepiction` alone leaves
    // the exact 2026-07-24 production failure reachable through an untagged mention. Mis-tagging is
    // demonstrably routine on this pipeline (three object beats tagged to a person on the 2026-08-17
    // Crossroads reel), so an untagged name is a live path, not a hypothetical one.
    //
    // So: withhold anyone whose identity must be withheld and who is EITHER tagged here OR named anywhere
    // in this shot's prose. Reel-wide candidates, per-scene trigger.
    const withheldCandidates = (storyBible?.entities ?? []).filter(
      (e) => MODES_WITHOUT_PLATES.has(e.depiction?.depictionMode ?? 'generated'),
    )
    const taggedWithheld = new Set(identityWithheldEntities(sceneDepiction).map((e) => slug(e.id)))
    const withheld = withheldCandidates.filter(
      (e) => taggedWithheld.has(slug(e.id)) || mentionsAny(scene.visualPrompt ?? '', personNameVariants(e.id)),
    )
    if (withheld.length > 0) {
      const namedOnly = withheld.filter((e) => !taggedWithheld.has(slug(e.id))).map((e) => e.id)
      if (namedOnly.length > 0) {
        console.warn(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: prose NAMES withheld ${namedOnly.join(', ')} without tagging them — withholding anyway`)
      }
      const stripped = new Set(withheld.map((e) => slug(e.id)))
      if (refPrimary && stripped.has(slug(refPrimary))) refPrimary = null
      refSupporting = refSupporting.filter((id) => !stripped.has(slug(id)))
    }

    // Entities this scene features (narrator suppressed for reference PLATES via sceneEntities, the same
    // resolver the prompt assembler uses), resolved from the visibility-adjusted refs above so a POV beat
    // neither splices the narrator's description NOR conditions on her plate (both would draw her figure).
    // Non-empty plate set → reference-conditioned edit on fal; empty → text-to-image. Entities without a
    // minted plate simply don't contribute a reference.
    const sceneEnts = storyBible
      ? sceneEntities(storyBible, { primaryEntity: refPrimary, supportingEntities: refSupporting, appearanceByEntity })
      : []
    // A scene may explicitly say that the verified source itself is the shot. Keep that editorial choice
    // separate from ordinary identity conditioning: otherwise a document/artwork gets handed to an image
    // model and comes back as a persuasive but false facsimile. Wrong-state variants are rejected by the
    // pure resolver before any scene-image spend.
    const sourcePresentationTarget = presentedSourceTarget(
      sceneEnts,
      scene.sourcePresentationEntity,
      refPrimary,
      appearanceByEntity,
    )
    if (scene.sourcePresentationEntity && !sourcePresentationTarget) {
      throw new Error(
        `[generate_images] scene ${scene.idx} requested source presentation for "${scene.sourcePresentationEntity}" but it is not the sourced primary entity in its base state`,
      )
    }
    // INVARIANT 1, enforced by the shared helper rather than a local filter — and applied on top of the
    // tag-strip above. Two guards on the same rule is deliberate: this one holds even if a future edit
    // changes how tags are resolved.
    const referenceImageKeys = conditionableReferenceKeys(sceneEnts)

    // A scene conditioning on a real historical person's sourced plate must be framed as a reconstruction —
    // the depictive-ethics floor's condition for the CARE tier (a sourced plate bypasses REFERENCE_FRAMING,
    // so the framing rides on the scene prompt).
    const isReconstruction = sceneEnts.some(
      (e) => e.depiction?.subjectClass === 'human' && e.referenceOrigin?.type === 'sourced' && Boolean(e.referenceImageKey),
    )

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
      ? { bible: storyBible, primaryEntity: refPrimary, supportingEntities: refSupporting, appearanceByEntity }
      : undefined
    const negativePrompt = assembleNegativePrompt({ genreCategory: genre })

    // ARCHIVAL CONFLICT POLICY (v1, deliberately conservative).
    //
    // Two conditions, and the second is the one live data taught us. (a) Only a SINGLE archival subject can
    // be attempted: per-subject lead-image sourcing cannot produce a photograph containing two specific
    // people, and compositing them is forbidden — a composite of two real people is a fabricated record.
    // (b) That subject must be the scene's PRIMARY one, i.e. its depiction is what the beat is about.
    //
    // Detection deliberately scans the whole entity set (a real person can matter without being primary),
    // but FULFILMENT must not: on the Crossroads reel, two scenes about Duchamp's urinal merely listed him
    // as supporting, and swapping them for a portrait of him would have thrown away the actual subject of
    // the shot. When an archival person is present but not primary, they are withheld — the scene generates
    // around its real subject with their identity scrubbed, which is both safer and truer to the beat.
    const archivalTarget = archivalShotTarget(sceneDepiction.archivalEntities, scene.primaryEntity, sceneDepiction.referenceEntities)
    if (sceneDepiction.archivalEntities.length > 1) {
      console.log(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: ${sceneDepiction.archivalEntities.length} archival subjects — no single archival source can depict them together, using representative staging`)
    } else if (sceneDepiction.archivalEntities.length === 1 && !archivalTarget) {
      console.log(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: "${sceneDepiction.archivalEntities[0]!.id}" is present but not the subject — withholding their identity and generating the scene's actual subject`)
    }

    const finalPrompt = assembleImagePrompt(scene.visualPrompt!, effectiveStyle, expansion, lighting, cast, isReconstruction)

    const inputHash = buildInputHash('generate_images.v4', {
      finalPrompt,
      sceneIdx: scene.idx,
      reelId,
      model: SCENE_IMAGE_MODEL,
      quality: SCENE_IMAGE_QUALITY, // in the hash so a recipe change busts the cache + regenerates
      referenceImageKeys, // re-render when a scene's references change (gained/lost a plate)
      sourcePresentation: sourcePresentationTarget?.referenceOrigin?.sourceAssetKey ?? '',
      engine: `${sceneEngine.imageModel}|${sceneEngine.editModel}`, // switching engine (incl. scare→Flux) busts the cache
      // The archival subjects are inputs even though they never reach the prompt: they decide whether this
      // scene is fulfilled by a real photograph and whether the prose is scrubbed.
      archival: withheld.map((e) => slug(e.id)).sort().join(','),
      ...(sceneDepiction.archivalEntities.length > 0 && sceneDepiction.referenceEntities.length > 0
        ? { archivalCoSubjectPolicy: 'event-led.v1' }
        : {}),
    })

    // Per-scene step row (not the bare 'generate_images') so concurrent scenes don't collide on one
    // (reelId, stepName) ledger row — the collision hid failures from retry and stuck reels from the reaper.
    await runStep(
      { reelId, stepName: `generate_images:scene${scene.idx}` as never, inputHash },
      async (cost) => {
        // ── EXACT SOURCE FULFILMENT ───────────────────────────────────────────────────────────────
        // The evidence is the image. Copy the untouched, already-verified source bytes into the scene;
        // do not crop, restyle, colourise, composite, or ask a generator to redraw them. Render-time
        // framing may pan/fit the still, exactly like any other presented archival shot.
        if (sourcePresentationTarget?.referenceOrigin?.sourceAssetKey) {
          const sourceKey = sourcePresentationTarget.referenceOrigin.sourceAssetKey
          const sourceBytes = await downloadBuffer(sourceKey)
          const key = `reels/${reelId}/scenes/${scene.idx}-source.webp`
          await uploadBuffer(key, sourceBytes, sniffImageMediaType(sourceBytes))
          const origin: MediaOrigin = {
            ...sourcePresentationTarget.referenceOrigin,
            usage: 'presented_archival',
            sourceAssetKey: sourceKey,
            conditioningAssetKey: undefined,
            conditioningTransform: undefined,
          }
          const [asset] = await db
            .insert(assets)
            .values({
              reelId,
              channelId: reel.channelId,
              kind: 'image',
              storageKey: key,
              provider: origin.provider ?? 'source',
              costCents: cost.total,
              meta: { archival: true, exactSource: true, subject: sourcePresentationTarget.id, origin, truthQaRequired, truthQaPass: true, truthQaIssues: [], depictionBasis: scene.depictionBasis },
            })
            .onConflictDoUpdate({
              target: [assets.reelId, assets.storageKey],
              set: {
                provider: origin.provider ?? 'source',
                costCents: cost.total,
                meta: { archival: true, exactSource: true, subject: sourcePresentationTarget.id, origin, truthQaRequired, truthQaPass: true, truthQaIssues: [], depictionBasis: scene.depictionBasis },
                createdAt: new Date(),
              },
            })
            .returning()
          await db
            .update(scenes)
            .set({ imageAssetId: asset!.id, imageOrigin: origin })
            .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, scene.idx)))
          console.log(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: presented exact source for "${sourcePresentationTarget.id}" untouched`)
          return { output: { assetId: asset!.id, archival: true, exactSource: true }, costCents: cost.total }
        }

        // ── ARCHIVAL FULFILMENT ──────────────────────────────────────────────────────────────────
        // A genuine licensed photograph, presented as itself. Nothing generative touches it: no /edit, no
        // style preset, no negative prompt, no colourisation. Framing and motion at render time are
        // editorial; modifying the pixels would turn real media into a fabricated record.
        if (archivalTarget?.depiction && canUseArchivalHumanShot(policy, archivalTarget.depiction)) {
          const { media, costCents } = await fetchVerifiedMedia(archivalTarget, archivalTarget.depiction, 'presented_archival')
          cost.add(costCents)
          if (media) {
            const key = `reels/${reelId}/scenes/${scene.idx}-archival.webp`
            await uploadBuffer(key, media.buffer, media.mime)
            const origin: MediaOrigin = { ...media.origin, sourceAssetKey: key }
            const [asset] = await db
              .insert(assets)
              .values({ reelId, channelId: reel.channelId, kind: 'image', storageKey: key, provider: 'wikimedia', costCents: cost.total, meta: { archival: true, subject: archivalTarget.id, origin } })
              .onConflictDoUpdate({
                target: [assets.reelId, assets.storageKey],
                set: { provider: 'wikimedia', costCents: cost.total, meta: { archival: true, subject: archivalTarget.id, origin }, createdAt: new Date() },
              })
              .returning()
            await db
              .update(scenes)
              .set({ imageAssetId: asset!.id, imageOrigin: origin })
              .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, scene.idx)))
            console.log(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: presented archival photograph of "${archivalTarget.id}" (${media.origin.license})`)
            return { output: { assetId: asset!.id, archival: true, exactSource: false }, costCents: cost.total }
          }
          console.warn(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: no archival photograph for "${archivalTarget.id}" → representative staging`)
        }

        // ── SANITIZED FALLBACK — INVARIANT 2 ─────────────────────────────────────────────────────
        // We are about to GENERATE a frame for a scene that involves a living/recent real person. Their
        // plate was withheld and their description stripped, but the shot's own prose may still name them
        // ("Close-up of DTI officials shaking hands…" — the 2026-07-24 production failure). Rendered
        // photoreal, that frame is a fabricated press photo, so the name must not reach the model.
        //
        // Three layers, in order: an LLM rewrites the beat into representative staging (the POSITIVE
        // replacement the floor requires); a deterministic scrub over the assembled prompt is the actual
        // GUARANTEE; and if a name survives either check we discard the rewrite entirely rather than trust
        // the rest of it.
        let renderPrompt = finalPrompt
        // What vision QA judges the render AGAINST. Normally the scene's own brief — but when an identity is
        // withheld, the brief still names the person we deliberately refused to draw, so QA would fail the
        // frame for obeying the floor ("Marcel Duchamp is not present in the frame") and burn a re-roll doing
        // it. Observed live on 2026-08-12: every withheld scene failed QA twice and kept attempt 0 anyway.
        // QA has to grade the shot we actually asked for.
        let qaBrief = [scene.visualPrompt!, eraContext].filter(Boolean).join('\n')
        if (withheld.length > 0) {
          const names = withheld.flatMap((e) => personNameVariants(e.id))
          const label = withheld.map((e) => entityName(e.id)).join(', ')
          let staged = ''
          try {
            const sp = buildRepresentativeStagingPrompt(scene.visualPrompt!, label)
            const rewrite = await llmCall({
              templateVersion: ENTITY_SOURCE_V1_VERSION, schema: RepresentativeStagingSchema,
              provider: 'anthropic', model: DEPICTION_MODEL,
              system: sp.system, messages: [{ role: 'user', content: sp.userMessage }],
            })
            cost.add(rewrite.costCents)
            staged = rewrite.data.imagePrompt.trim()
          } catch (err) {
            console.warn(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx} representative-staging rewrite failed: ${err instanceof Error ? err.message : String(err)}`)
          }
          // A rewrite that still names the person did not do its job — don't keep any of it.
          if (!staged || mentionsAny(staged, names)) {
            if (staged) console.warn(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: staging rewrite still named the subject → safe staging`)
            staged = SAFE_REPRESENTATIVE_STAGING
          }
          renderPrompt = scrubNames(assembleImagePrompt(staged, effectiveStyle, expansion, lighting, cast, isReconstruction), names)
          // Post-condition. A name here means it arrived through a path neither layer covers (another
          // entity's description, the style preset) — fall back to staging that names nothing at all.
          if (mentionsAny(renderPrompt, names)) {
            console.warn(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: subject name survived scrubbing → falling back to name-free staging`)
            renderPrompt = assembleImagePrompt(SAFE_REPRESENTATIVE_STAGING, effectiveStyle, undefined, lighting, cast)
            staged = SAFE_REPRESENTATIVE_STAGING
          }
          // Grade against the staging we asked for, scrubbed the same way, so QA can neither reward nor
          // punish the render for the identity we withheld.
          qaBrief = scrubNames([staged, eraContext].filter(Boolean).join('\n'), names)
          console.log(`[generate-images] ${reelId.slice(0, 8)} scene${scene.idx}: generated with representative staging (identity withheld: ${label})`)
        }

        const qa = isQATarget(scene)
        let chosen: Awaited<ReturnType<typeof generateImageWithRetry>> | undefined
        let extraNeg = '' // targeted negatives added across re-rolls to push the model off the flagged failure
        let lastIssues: string[] = [] // QA verdict of the kept image ([] = passed / not QA'd)
        let lastTruthIssues: string[] = []
        let lastTruthPass = true
        // KEEP THE BEST ATTEMPT, not the last. Attempts overwrite the same storage key, so without this a
        // near-miss roll (failed QA on one nit) gets clobbered by a later, WORSE roll — observed live: a
        // reveal's attempt 0 drew the story's contradiction almost right, got re-rolled, and attempt 1 (a
        // studio portrait) was what shipped. Track each attempt's bytes + issue count and restore the best
        // after the loop when the final roll didn't win. Fewest QA issues = best (a pass is 0).
        let best: { buffer: Buffer; issues: string[]; truthPass: boolean; truthIssues: string[]; attempt: number } | undefined

        // Each attempt re-generates (gpt-image-1 is non-deterministic, so a re-roll is a genuinely
        // different render) and overwrites the same storage key, so stopping at the first pass leaves the
        // passing image in place. Non-QA scenes generate exactly once.
        for (let attempt = 0; attempt <= (qa ? MAX_QA_REROLLS : 0); attempt++) {
          const result = await generateImageWithRetry({
            prompt: renderPrompt,
            negativePrompt: extraNeg ? `${negativePrompt}, ${extraNeg}` : negativePrompt,
            reelId,
            sceneIdx: scene.idx,
            aspect,
            mood: scene.mood,
            stylePreset: effectiveStyle,
            genreCategory: genre,
            referenceImageKeys,
            engine: sceneEngine,
          }, cost.add)
          cost.add(result.costCents) // record spend the moment it's incurred, so a throw below doesn't lose it
          chosen = result

          if (!qa) break

          const buffer = await downloadBuffer(result.asset.storageKey)
          const expectedAppearance = Object.keys(appearanceByEntity).length > 0
            ? sceneEnts.map((entity) => `${entity.id}: ${entity.description}`).join('\n')
            : undefined
          const { verdict, costCents } = await imageQA(buffer, qaBrief, expectedAppearance, {
            required: truthQaRequired,
            depictionBasis: scene.depictionBasis as DepictionBasis,
            narrationText: scene.narrationText,
          })
          cost.add(costCents)
          lastIssues = verdict.issues
          lastTruthPass = verdict.truthPass
          lastTruthIssues = verdict.truthIssues
          const score = (verdict.truthPass ? 0 : 1000) + verdict.truthIssues.length * 100 + verdict.issues.length
          const bestScore = best ? (best.truthPass ? 0 : 1000) + best.truthIssues.length * 100 + best.issues.length : Number.POSITIVE_INFINITY
          if (score < bestScore) best = { buffer, issues: verdict.issues, truthPass: verdict.truthPass, truthIssues: verdict.truthIssues, attempt }
          if (verdict.pass && verdict.truthPass) {
            lastIssues = []
            lastTruthPass = true
            lastTruthIssues = []
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
          console.warn(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} attempt ${attempt} failed → ${tag}: ${[...verdict.truthIssues, ...verdict.issues].join('; ')}`)
        }

        // The canonical key holds the LAST attempt's bytes; if an earlier attempt scored better (fewer QA
        // issues), restore its bytes so the kept image is the closest roll to the brief.
        if (qa && best && ((best.truthPass ? 0 : 1000) + best.truthIssues.length * 100 + best.issues.length) < ((lastTruthPass ? 0 : 1000) + lastTruthIssues.length * 100 + lastIssues.length)) {
          await uploadBuffer(chosen!.asset.storageKey, best.buffer, sniffImageMediaType(best.buffer))
          lastIssues = best.issues
          lastTruthPass = best.truthPass
          lastTruthIssues = best.truthIssues
          console.log(`[image-qa] ${reelId.slice(0, 8)} scene${scene.idx} restored attempt ${best.attempt} (fewest issues: ${best.issues.length})`)
        }

        // Persist asset + link to scene. QA verdict rides on meta (qaPass / qaIssues) so a later storyboard
        // pass can flag "this hero shot may not match the brief" to the operator instead of it being silent.
        const meta = {
          ...(chosen!.asset.meta as Record<string, unknown>),
          visualPrompt: scene.visualPrompt, // store the prompt so undo/redo can restore it with the image
          ...(qa ? { qaPass: lastIssues.length === 0 } : {}),
          ...(lastIssues.length ? { qaIssues: lastIssues } : {}),
          truthQaRequired,
          // Craft conformance and truth are deliberately independent. A conceptual frame that communicates
          // through a different composition remains a storyboard note; a verified identity/state error is
          // a hard last-mile blocker. image-qa.v1.5 explicitly classifies object geometry/orientation/marks
          // as truth, closing the Fountain miss without promoting every prompt detail into factual law.
          truthQaPass: !truthQaRequired || lastTruthPass,
          truthQaIssues: truthQaRequired ? lastTruthIssues : [],
          depictionBasis: scene.depictionBasis,
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
          .set({ imageAssetId: asset!.id, imageOrigin: null })
          .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, scene.idx)))

        if (isBlockingImageTruthFailure(truthQaRequired, { truthPass: lastTruthPass })) {
          blockingTruthFailures.push(`scene ${scene.idx}: ${lastTruthIssues.join('; ') || 'factual image truth QA failed without a reason'}`)
        }

        return { output: { assetId: asset!.id, archival: false, exactSource: false }, costCents: cost.total }
      },
    )
  }

  // Rolling pool — fast without flooding fal, and one bad scene doesn't abort the others.
  await runPool(pending, IMAGE_CONCURRENCY, processScene, 'scene image')
  if (blockingTruthFailures.length > 0) {
    throw new Error(`[visual-truth-image-qa] ${blockingTruthFailures.join(' | ')}`)
  }
}

// Vision QA: does the render match the brief's checkable intent? Takes the image BYTES (the caller
// downloads once and reuses the buffer for best-attempt tracking). Sniffs the real media type so it works
// regardless of fal's output format. Cheap (Haiku); only called on QA-target scenes.
async function imageQA(buf: Buffer, visualPrompt: string, expectedAppearance?: string, truth?: { required: boolean; depictionBasis: DepictionBasis; narrationText: string }): Promise<{ verdict: z.infer<typeof ImageQASchema>; costCents: number }> {
  const { system, userMessage } = buildImageQAPrompt(visualPrompt, expectedAppearance, truth)
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
          { type: 'image', mediaType: sniffImageMediaType(buf), base64: buf.toString('base64') },
          { type: 'text', text: userMessage },
        ],
      },
    ],
  })
  return { verdict: ImageQASchema.parse(r.data), costCents: r.costCents }
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

// `spend` reports the rephrase LLM the moment it's billed, instead of accumulating it into the return
// value: every path out of this function except a clean render either throws (non-filter error, or the
// fallback render failing) or is reached after several paid rephrases, and a returned total is lost in all
// of them. The caller's cost sink persists what it's told even when the step later fails, so the returned
// costCents is now the image price alone and rephrase spend is never stranded.
async function generateImageWithRetry(params: ImageGenAttemptParams, spend: (cents: number) => void) {
  let currentPrompt = params.prompt
  let refKeys = params.referenceImageKeys
  const provider: 'openai' | 'fal' = params.engine.family === 'openai' ? 'openai' : 'fal'

  for (let attempt = 0; attempt < MAX_REPHRASE_ATTEMPTS; attempt++) {
    try {
      const result = await renderImage(params.engine, {
        prompt: currentPrompt,
        negativePrompt: params.negativePrompt,
        reelId: params.reelId,
        sceneIdx: params.sceneIdx,
        aspect: params.aspect,
        referenceImageKeys: refKeys, // [] → plain text→image; non-empty → reference-conditioned
      }, spend)
      return { ...result, provider, costCents: result.costCents }
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
        spend(rephrase.costCents)
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
  }, spend)
  console.warn(`[generate-images] ${params.reelId.slice(0, 8)} scene${params.sceneIdx} exhausted safety-filter rephrases → mood-only atmosphere fallback`)
  return { ...fallback, provider, costCents: fallback.costCents }
}
