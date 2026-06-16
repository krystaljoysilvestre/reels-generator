import { eq, and } from 'drizzle-orm'
import { getDb, reels, scenes, assets, channels } from '@reels/db'
import { generateImage, buildInputHash, ContentFilterError, FalEngineSchema, llmCall } from '@reels/providers'
import { assembleImagePrompt, assembleNegativePrompt } from '@reels/core'
import { z } from 'zod'
import { buildRephrasePrompt, REPHRASE_V1_VERSION } from '../../prompts-bridge.js'
import { runStep } from '../harness.js'

// generate_images — step 4 (docs/02 §4)
// Fan-out: one image per scene. Style preset injected server-side [CLAUDE.md rule 2].
// Content-filter rejection → rephrase.v1 retry (max 3) → mood-only downgrade.

const MAX_REPHRASE_ATTEMPTS = 3

export async function generateImages(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) throw new Error(`Reel not found: ${reelId}`)

  const [reelScenes, channel] = await Promise.all([
    db.query.scenes.findMany({ where: eq(scenes.reelId, reelId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
  ])
  if (!channel) throw new Error(`Channel not found: ${reel.channelId}`)

  // Engine config from channel or default
  const engine = FalEngineSchema.parse({})

  // Fan-out: generate each scene image in sequence (BullMQ rate-limit handles concurrency)
  for (const scene of reelScenes) {
    if (!scene.visualPrompt) continue
    if (scene.imageAssetId) continue // already generated (idempotency)

    // Server-side style suffix injection [CLAUDE.md rule 2 — LLM never sees this]
    const finalPrompt = assembleImagePrompt(scene.visualPrompt, channel.stylePreset)
    const negativePrompt = assembleNegativePrompt()

    const inputHash = buildInputHash('generate_images.v1', {
      finalPrompt,
      sceneIdx: scene.idx,
      reelId,
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
          mood: scene.mood,
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
}

interface ImageGenAttemptParams {
  prompt: string
  negativePrompt: string
  reelId: string
  sceneIdx: number
  engine: ReturnType<typeof FalEngineSchema.parse>
  mood: string[]
}

async function generateImageWithRetry(params: ImageGenAttemptParams) {
  let currentPrompt = params.prompt
  let totalCost = 0
  const db = getDb()

  for (let attempt = 0; attempt < MAX_REPHRASE_ATTEMPTS; attempt++) {
    try {
      const result = await generateImage({
        prompt: currentPrompt,
        negativePrompt: params.negativePrompt,
        reelId: params.reelId,
        sceneIdx: params.sceneIdx,
        engine: params.engine,
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
        // Final attempt failed → mood-only downgrade
        currentPrompt = `${params.mood.join(', ')} atmosphere, abstract, cinematic still, vertical 9:16`
      }
    }
  }
  throw new Error(`Image generation failed after ${MAX_REPHRASE_ATTEMPTS} rephrase attempts`)
}
