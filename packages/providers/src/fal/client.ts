import { fal } from '@fal-ai/client'
import { z } from 'zod'
import { uploadBuffer } from '../shared/storage.js'
import {
  ContentFilterError,
  ProviderError,
  ProviderRateLimitError,
  type ProviderResult,
} from '../shared/types.js'
import {
  FAL_CONTENT_FILTER_CODES,
  FAL_IMAGE_COST_CENTS,
  FAL_VIDEO_COST_CENTS_PER_SEC,
  FAL_VIDEO_COST_CENTS_PER_SEC_BUDGET,
  type FalEngine,
} from './config.js'

const FalImageOutputSchema = z.object({
  images: z.array(z.object({ url: z.string() })).min(1),
})

const FalVideoOutputSchema = z.object({
  video: z.object({ url: z.string() }),
})

function initFal() {
  const key = process.env['FAL_KEY']
  if (!key) throw new Error('FAL_KEY is not set')
  fal.config({ credentials: key })
}

function isFalContentFilter(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  const errorType = String(e['type'] ?? e['error_type'] ?? '')
  const status = Number(e['status'] ?? e['statusCode'] ?? 0)
  return status === 422 && FAL_CONTENT_FILTER_CODES.has(errorType)
}

function isFalRateLimit(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  return Number((err as Record<string, unknown>)['status'] ?? 0) === 429
}

// Idempotent GET of a generated asset — safe to time out + retry once.
async function fetchToBuffer(url: string): Promise<Buffer> {
  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
      if (!res.ok) throw new ProviderError('fal', `Failed to fetch asset: ${res.status}`)
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      lastErr = err
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError('fal', 'Failed to fetch asset')
}

// ── Image generation ─────────────────────────────────────────────────────────

export interface ImageGenParams {
  prompt: string
  negativePrompt?: string
  reelId: string
  sceneIdx: number
  engine: FalEngine
}

export async function generateImage(params: ImageGenParams): Promise<ProviderResult> {
  initFal()

  try {
    const result = await fal.subscribe(params.engine.imageModelId, {
      input: {
        prompt: params.prompt,
        negative_prompt: params.negativePrompt ?? '',
        image_size: 'portrait_4_3',
        num_images: 1,
        enable_safety_checker: true,
      },
    })

    const parsed = FalImageOutputSchema.safeParse(result.data)
    if (!parsed.success || !parsed.data.images[0]) {
      throw new ProviderError('fal', `Unexpected image response: ${JSON.stringify(result.data)}`)
    }

    const buffer = await fetchToBuffer(parsed.data.images[0].url)
    const storageKey = `reels/${params.reelId}/scenes/${params.sceneIdx}/image.webp`
    await uploadBuffer(storageKey, buffer, 'image/webp')

    return {
      asset: { storageKey, meta: { prompt: params.prompt } },
      costCents: FAL_IMAGE_COST_CENTS,
      providerJobId: result.requestId,
    }
  } catch (err) {
    if (isFalContentFilter(err)) {
      throw new ContentFilterError(
        params.prompt,
        String((err as Record<string, unknown>)['message'] ?? err),
      )
    }
    if (isFalRateLimit(err)) throw new ProviderRateLimitError('fal')
    if (err instanceof ContentFilterError || err instanceof ProviderError) throw err
    throw new ProviderError('fal', String(err))
  }
}

// ── Video generation (image-to-video) ────────────────────────────────────────

export interface VideoGenParams {
  imageStorageKey: string
  motionPrompt: string
  durationSec?: number
  reelId: string
  sceneIdx: number
  variationIdx: number
  engine: FalEngine
  budget?: boolean
}

export async function generateVideo(params: VideoGenParams): Promise<ProviderResult> {
  initFal()

  const modelId = params.budget
    ? params.engine.videoFallbackModelId
    : params.engine.videoModelId
  const durationSec = params.durationSec ?? 5
  const costPerSec = params.budget
    ? FAL_VIDEO_COST_CENTS_PER_SEC_BUDGET
    : FAL_VIDEO_COST_CENTS_PER_SEC

  try {
    const { downloadBuffer } = await import('../shared/storage.js')
    const imgBuf = await downloadBuffer(params.imageStorageKey)
    const imgBase64 = `data:image/webp;base64,${imgBuf.toString('base64')}`

    const result = await fal.subscribe(modelId, {
      input: {
        image_url: imgBase64,
        prompt: params.motionPrompt,
        duration: durationSec,
      },
    })

    const parsed = FalVideoOutputSchema.safeParse(result.data)
    if (!parsed.success) {
      throw new ProviderError('fal', `Unexpected video response: ${JSON.stringify(result.data)}`)
    }

    const buffer = await fetchToBuffer(parsed.data.video.url)
    const storageKey = `reels/${params.reelId}/scenes/${params.sceneIdx}/video_v${params.variationIdx}.mp4`
    await uploadBuffer(storageKey, buffer, 'video/mp4')

    return {
      asset: {
        storageKey,
        meta: { motionPrompt: params.motionPrompt, durationSec, modelId },
      },
      costCents: Math.ceil(durationSec * costPerSec),
      providerJobId: result.requestId,
    }
  } catch (err) {
    if (isFalContentFilter(err)) {
      throw new ContentFilterError(
        params.motionPrompt,
        String((err as Record<string, unknown>)['message'] ?? err),
      )
    }
    if (isFalRateLimit(err)) throw new ProviderRateLimitError('fal')
    if (err instanceof ContentFilterError || err instanceof ProviderError) throw err
    throw new ProviderError('fal', String(err))
  }
}
