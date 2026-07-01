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
  referenceImageKey?: string // single reference (legacy regen path): edit FROM this R2 image
  referenceImageKeys?: string[] // multi reference (entity plates): condition the new scene on these identities
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

  // Reference plates for identity conditioning (multi), falling back to the single legacy key.
  const refKeys = params.referenceImageKeys?.length ? params.referenceImageKeys : (params.referenceImageKey ? [params.referenceImageKey] : [])

  try {
    let b64: string | undefined
    if (refKeys.length > 0) {
      // Condition on the reference plate(s): gpt-image-1 edit accepts an array of input images and uses them
      // as references to render THIS scene's prompt — so a recurring character keeps the same face/wardrobe.
      // (No moderation override here: the SDK's edit type rejects it, and reference-conditioned scenes are
      // the non-gory character beats; the gory reveal is text-to-image below, where moderation:'low' applies.)
      const files = await Promise.all(refKeys.map(async (k) => toFile(await downloadBuffer(k), 'reference.webp', { type: 'image/webp' })))
      // moderation:'low' isn't in the SDK's edit param type yet (the API accepts it for gpt-image-1) — build
      // the body and cast so the non-streaming overload is selected AND the flag is sent at runtime. Without
      // it the edit path runs at strict moderation and minor+horror scenes get content-filtered.
      const editBody: Record<string, unknown> = { model: SCENE_IMAGE_MODEL, image: files, prompt, size, quality, n: 1, output_format: 'webp', moderation: 'low' }
      const res = await withProviderLimit('openai', () => client.images.edit(editBody as unknown as OpenAI.ImageEditParamsNonStreaming))
      b64 = res.data?.[0]?.b64_json
    } else {
      const res = await withProviderLimit('openai', () => client.images.generate({
        model: SCENE_IMAGE_MODEL,
        prompt,
        size,
        quality,
        n: 1,
        output_format: 'webp',
        moderation: 'low', // least-restrictive gpt-image-1 filtering — lets horror dread through (still no hard gore)
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
