import OpenAI, { toFile } from 'openai'
import { uploadBuffer, downloadBuffer } from '../shared/storage.js'
import { withProviderLimit } from '../shared/limiter.js'
import {
  ContentFilterError,
  ProviderError,
  ProviderRateLimitError,
  type ProviderResult,
} from '../shared/types.js'
import {
  ASPECT_TO_OPENAI_SIZE,
  OPENAI_CONTENT_FILTER_MARKERS,
  OPENAI_IMAGE_COST_CENTS,
  SCENE_IMAGE_MODEL,
  SCENE_IMAGE_QUALITY,
  type ImageQuality,
} from './config.js'

let _client: OpenAI | undefined
function getClient() {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  _client ??= new OpenAI({ apiKey, timeout: 120_000, maxRetries: 1 })
  return _client
}

function isContentFilter(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError)) return false
  if (err.status !== 400) return false
  const hay = `${err.code ?? ''} ${err.message ?? ''}`.toLowerCase()
  return OPENAI_CONTENT_FILTER_MARKERS.some((m) => hay.includes(m))
}

export interface ImageGenParams {
  prompt: string
  negativePrompt?: string
  reelId: string
  sceneIdx: number
  storageKey?: string // override the R2 key (e.g. for ephemeral style-option previews)
  aspect?: string // '9:16' (default — the reel frame), etc. Drives image size.
  quality?: ImageQuality // defaults to the shared SCENE_IMAGE_QUALITY
  referenceImageKey?: string // if set → edit FROM this R2 image: keeps its composition/room/lighting
}

// gpt-image-1 has no negative_prompt, so artifacts/content to avoid are folded into the prompt text.
function withNegatives(prompt: string, negativePrompt?: string): string {
  const neg = negativePrompt?.trim()
  return neg ? `${prompt.trim()}. Avoid: ${neg}.` : prompt.trim()
}

export async function generateImage(params: ImageGenParams): Promise<ProviderResult> {
  const client = getClient()
  const quality = params.quality ?? SCENE_IMAGE_QUALITY
  const size = ASPECT_TO_OPENAI_SIZE[params.aspect ?? '9:16'] ?? '1024x1536'
  const prompt = withNegatives(params.prompt, params.negativePrompt)

  try {
    let b64: string | undefined
    if (params.referenceImageKey) {
      // Edit from the reference image: keep its room/door/light + framing, render THIS scene's action.
      const refBuf = await downloadBuffer(params.referenceImageKey)
      const refFile = await toFile(refBuf, 'reference.webp', { type: 'image/webp' })
      const res = await withProviderLimit('openai', () => client.images.edit({
        model: SCENE_IMAGE_MODEL,
        image: refFile,
        prompt,
        size,
        quality,
        n: 1,
        output_format: 'webp',
      }))
      b64 = res.data?.[0]?.b64_json
    } else {
      const res = await withProviderLimit('openai', () => client.images.generate({
        model: SCENE_IMAGE_MODEL,
        prompt,
        size,
        quality,
        n: 1,
        output_format: 'webp',
      }))
      b64 = res.data?.[0]?.b64_json
    }

    if (!b64) throw new ProviderError('openai', 'No image returned')

    const buffer = Buffer.from(b64, 'base64')
    const storageKey = params.storageKey ?? `reels/${params.reelId}/scenes/${params.sceneIdx}/image.webp`
    await uploadBuffer(storageKey, buffer, 'image/webp')

    return {
      asset: { storageKey, meta: { prompt: params.prompt } },
      costCents: OPENAI_IMAGE_COST_CENTS[quality],
    }
  } catch (err) {
    if (isContentFilter(err)) {
      throw new ContentFilterError(params.prompt, err instanceof Error ? err.message : String(err))
    }
    if (err instanceof OpenAI.APIError && err.status === 429) throw new ProviderRateLimitError('openai')
    if (err instanceof ContentFilterError || err instanceof ProviderError) throw err
    throw new ProviderError('openai', String(err))
  }
}
