import { eq, and } from 'drizzle-orm'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { generateImage, buildInputHash, ContentFilterError, FalEngineSchema, llmCall } from '@reels/providers'
import { assembleImagePrompt, assembleNegativePrompt, PLATFORM_PRESETS } from '@reels/core'
import { z } from 'zod'
import { buildRephrasePrompt, REPHRASE_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// generate_images — step 4 (docs/02 §4)
// One image per scene (text-to-image). Style preset injected server-side [CLAUDE.md rule 2].
// Continuity: same-`location` scenes share a generation SEED (and the director describes the place
// consistently via the SETTING rule), so the room reads as the same place across shots — WITHOUT the
// framing/lighting flattening that image-to-image chaining causes (close-ups stay close, day stays day).
// (img2img is still available in the fal client for true same-shot continuity, just not the default.)
// Content-filter rejection → rephrase.v1 retry (max 3) → mood-only downgrade.

const MAX_REPHRASE_ATTEMPTS = 3

// Scene images render on flux/dev (not the cheaper schnell) for palette + detail fidelity, matching the
// flux/dev style-option previews the operator approves at creation. ~2× cost/image (~4¢→8¢).
const SCENE_IMAGE_MODEL = 'fal-ai/flux/dev'
const SCENE_IMAGE_GUIDANCE = 3.5
const SCENE_IMAGE_STEPS = 28
const IMAGE_CONCURRENCY = 4

// Stable seed from a string (FNV-1a). Same location string → same seed → flux nudges the room toward
// a consistent layout/palette across that location's scenes.
function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) % 2_000_000_000
}

export async function generateImages(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)

  const [reelScenes, channel] = await Promise.all([
    db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
  ])
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)

  // Engine config — scene images on flux/dev for palette + detail fidelity (see SCENE_IMAGE_MODEL).
  const engine = FalEngineSchema.parse({ imageModelId: SCENE_IMAGE_MODEL })
  // Generate at the channel's platform aspect (reels are 9:16) so scene images fill the frame.
  const aspect = (PLATFORM_PRESETS[(channel.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all).aspect

  const pending = reelScenes.filter((s) => s.visualPrompt && !s.imageAssetId) // skip already-generated (idempotency)

  const processScene = async (scene: (typeof pending)[number]) => {
    // Server-side style suffix injection [CLAUDE.md rule 2 — LLM never sees this]
    const finalPrompt = assembleImagePrompt(scene.visualPrompt!, channel.stylePreset)
    const negativePrompt = assembleNegativePrompt()
    // Same-location scenes share a seed → consistent room. Untagged scenes get their own (idx-based) seed.
    const seed = seedFromString(`${reelId}:${scene.location ?? `solo_${scene.idx}`}`)

    const inputHash = buildInputHash('generate_images.v1', {
      finalPrompt,
      sceneIdx: scene.idx,
      reelId,
      model: engine.imageModelId,
      seed,
    })

    await runStep(
      { reelId, stepName: 'generate_images', inputHash: `${inputHash}:scene${scene.idx}` as never },
      async () => {
        const result = await generateImageWithRetry({
          prompt: finalPrompt,
          negativePrompt,
          reelId,
          sceneIdx: scene.idx,
          engine,
          aspect,
          mood: scene.mood,
          stylePreset: channel.stylePreset,
          seed,
        })

        // Persist asset + link to scene
        const [asset] = await db
          .insert(assets)
          .values({
            reelId,
            channelId: reel.channelId,
            kind: 'image',
            storageKey: result.asset.storageKey,
            provider: 'fal',
            costCents: result.costCents,
            meta: result.asset.meta,
          })
          .returning()

        await db
          .update(scenes)
          .set({ imageAssetId: asset!.id })
          .where(and(eq(scenes.reelId, reelId), eq(scenes.idx, scene.idx)))

        return { output: { assetId: asset!.id }, costCents: result.costCents }
      },
    )
  }

  // Capped-concurrency batches — fast without flooding fal with connections.
  for (let i = 0; i < pending.length; i += IMAGE_CONCURRENCY) {
    await Promise.all(pending.slice(i, i + IMAGE_CONCURRENCY).map(processScene))
  }
}

interface ImageGenAttemptParams {
  prompt: string
  negativePrompt: string
  reelId: string
  sceneIdx: number
  engine: ReturnType<typeof FalEngineSchema.parse>
  aspect: string
  mood: string[]
  stylePreset: string
  seed?: number
}

async function generateImageWithRetry(params: ImageGenAttemptParams) {
  let currentPrompt = params.prompt
  let totalCost = 0

  for (let attempt = 0; attempt < MAX_REPHRASE_ATTEMPTS; attempt++) {
    try {
      const result = await generateImage({
        prompt: currentPrompt,
        negativePrompt: params.negativePrompt,
        reelId: params.reelId,
        sceneIdx: params.sceneIdx,
        engine: params.engine,
        aspect: params.aspect,
        guidanceScale: SCENE_IMAGE_GUIDANCE,
        numInferenceSteps: SCENE_IMAGE_STEPS,
        ...(params.seed != null ? { seed: params.seed } : {}),
      })
      return { ...result, costCents: result.costCents + totalCost }
    } catch (err) {
      if (!(err instanceof ContentFilterError)) throw err

      // rephrase.v1 retry [docs/04 §4.3]
      const { system, userMessage } = buildRephrasePrompt(currentPrompt)
      const rephrase = await llmCall({
        templateVersion: REPHRASE_V1_VERSION,
        schema: z.string(),
        system,
        messages: [{ role: 'user', content: userMessage }],
      })
      totalCost += rephrase.costCents
      currentPrompt = typeof rephrase.data === 'string' ? rephrase.data : currentPrompt

      if (attempt === MAX_REPHRASE_ATTEMPTS - 1) {
        // Final attempt failed → mood-only downgrade. Drop the (rejected) subject but KEEP the channel
        // style so the fallback still looks like the rest of the reel, not a generic off-brand still.
        currentPrompt = assembleImagePrompt(
          `${params.mood.join(', ')} atmosphere, empty scene, abstract shapes, deep shadow, negative space`,
          params.stylePreset,
        )
      }
    }
  }
  throw new Error(`Image generation failed after ${MAX_REPHRASE_ATTEMPTS} rephrase attempts`)
}
