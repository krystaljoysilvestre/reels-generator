import { fal } from '@fal-ai/client'
import { z } from 'zod'
import { uploadBuffer, downloadBuffer } from '../shared/storage.js'
import { withProviderLimit } from '../shared/limiter.js'
import {
  ContentFilterError,
  ProviderError,
  ProviderRateLimitError,
  type ProviderResult,
} from '../shared/types.js'
import {
  FAL_CONTENT_FILTER_CODES,
  FAL_IMAGE_ASPECTS,
  FAL_IMAGE_TIMEOUT_MS,
  FLUX_IMAGE_SIZES,
  GEMINI_IMAGE_ENGINE,
  type ImageEngine,
} from './config.js'

// Still-image generation on fal. The companion to ../openai/image.ts: where gpt-image-1 is pure text→image,
// this path conditions on REFERENCE images (image_urls[]) so a recurring entity keeps its visual identity
// across independently-generated scenes (see specs/story-bible.md). With no references it's plain text→image
// (used to mint the per-entity reference plates). The MODEL is chosen per genre (see imageEngineForGenre):
// `family` picks the input/output adapter below — Gemini (aspect_ratio + webp) vs Flux (image_size + jpeg/png).

const FalImageOutputSchema = z.object({
  images: z.array(z.object({ url: z.string() })).min(1),
})

function initFal() {
  const key = process.env['FAL_KEY']
  if (!key) throw new Error('FAL_KEY is not set')
  fal.config({ credentials: key })
}

function isFalContentFilter(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as Record<string, unknown>
  // The content-policy code can be top-level (e.type) OR nested in the fal ValidationError body as
  // body.detail[].type (which is where flux-2-pro reports content_policy_violation). Collect both.
  const codes: string[] = [String(e['type'] ?? e['error_type'] ?? '')]
  const body = e['body']
  if (body && typeof body === 'object') {
    const detail = (body as Record<string, unknown>)['detail']
    if (Array.isArray(detail)) {
      for (const d of detail) {
        if (d && typeof d === 'object') codes.push(String((d as Record<string, unknown>)['type'] ?? ''))
      }
    }
  }
  return codes.some((c) => FAL_CONTENT_FILTER_CODES.has(c))
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

// nano-banana has no negative_prompt field — fold avoid-terms into the prompt as an "Avoid:" clause
// (same convention as the OpenAI path so prompts behave identically across providers).
function withNegatives(prompt: string, negativePrompt?: string): string {
  const neg = negativePrompt?.trim()
  return neg ? `${prompt.trim()}. Avoid: ${neg}.` : prompt.trim()
}

function toAspectRatio(aspect?: string): string {
  return aspect && FAL_IMAGE_ASPECTS.has(aspect) ? aspect : '9:16'
}

function toFluxSize(aspect?: string): string {
  return (aspect && FLUX_IMAGE_SIZES[aspect]) ?? 'portrait_16_9'
}

// Encode a reference image as a data URI with the mime that matches its actual bytes — plates may be webp
// (Gemini-minted) or png/jpeg (Flux-minted), and fal expects the data-URI mime to match.
function refDataUri(buf: Buffer): string {
  let mime = 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp'
  else if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) mime = 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

export interface FalImageGenParams {
  prompt: string
  negativePrompt?: string
  reelId: string
  sceneIdx?: number
  storageKey?: string // override the R2 key (e.g. for entity reference plates)
  aspect?: string // '9:16' (default — the reel frame). Mapped per family (aspect_ratio or image_size).
  // R2 keys of reference images. Non-empty → edit endpoint (keep these subjects' identity, render THIS
  // scene). Empty/absent → plain text→image (used to mint the references themselves).
  referenceImageKeys?: string[]
  engine?: ImageEngine // which model/family to render on (per genre). Defaults to Gemini/nano-banana.
}

export async function generateImageFal(params: FalImageGenParams): Promise<ProviderResult> {
  initFal()

  const prompt = withNegatives(params.prompt, params.negativePrompt)
  const engine = params.engine ?? GEMINI_IMAGE_ENGINE
  const refKeys = params.referenceImageKeys ?? []
  const isEdit = refKeys.length > 0
  const modelId = isEdit ? engine.editModel : engine.imageModel

  try {
    // Reference images (edit only) → data URIs with the correct mime. Identity is carried by these; the
    // prompt drives the new scene.
    const imageUrls = isEdit
      ? await Promise.all(refKeys.map(async (key) => refDataUri(await downloadBuffer(key))))
      : []

    // Per-family input shape + output container. Both return { images: [{ url }] }.
    const { input, contentType } = engine.family === 'flux'
      ? {
          // Flux.2 has NO num_images field — sending it is a 422. image_size enum (not aspect_ratio); png.
          // The PROMPT-level content checker is governed by safety_tolerance (1 strict … 5 most permissive),
          // NOT enable_safety_checker (that's the output NSFW blur). At the default "2", Flux rejected benign
          // horror prompts (a dark restroom, a student) as content_policy_violation — so for horror we set the
          // most permissive tolerance and turn off the output checker. (The prompt still guards nudity/gore.)
          input: {
            prompt,
            ...(isEdit ? { image_urls: imageUrls } : {}),
            image_size: toFluxSize(params.aspect),
            output_format: 'png',
            ...(engine.disableSafety
              ? { safety_tolerance: '5', enable_safety_checker: false }
              : {}),
          },
          contentType: 'image/png',
        }
      : {
          input: {
            prompt,
            ...(isEdit ? { image_urls: imageUrls } : {}),
            num_images: 1,
            // aspect_ratio is runtime-validated against FAL_IMAGE_ASPECTS; cast past the SDK's literal union.
            aspect_ratio: toAspectRatio(params.aspect) as never,
            output_format: 'webp',
          },
          contentType: 'image/webp',
        }

    // abortSignal is the only enforced deadline (the SDK's `timeout` is a no-op) — a stalled fal queue would
    // otherwise hang the job and hold a fal slot forever. Abort → rejects → slot released → job retries.
    const result = await withProviderLimit('fal', () =>
      fal.subscribe(modelId, { input: input as never, abortSignal: AbortSignal.timeout(FAL_IMAGE_TIMEOUT_MS) }),
    )

    const parsed = FalImageOutputSchema.safeParse(result.data)
    if (!parsed.success) {
      throw new ProviderError('fal', `Unexpected image response: ${JSON.stringify(result.data)}`)
    }

    const buffer = await fetchToBuffer(parsed.data.images[0]!.url)
    // Key stays .webp regardless of actual bytes — every downstream reader sniffs magic bytes, not the
    // extension (see generate-images sniffMediaType / render). contentType matches the real format.
    const storageKey = params.storageKey ?? `reels/${params.reelId}/scenes/${params.sceneIdx}/image.webp`
    await uploadBuffer(storageKey, buffer, contentType)

    return {
      asset: { storageKey, meta: { prompt: params.prompt, referenceCount: refKeys.length, model: modelId } },
      costCents: engine.costCents,
    }
  } catch (err) {
    if (isFalContentFilter(err)) {
      // Flux/BFL hard-blocks some benign content (school/teen + horror) regardless of safety_tolerance.
      // Fall back to Gemini/nano-banana for THIS image — it renders that content. Only flux→gemini (one
      // hop); a Gemini refusal is a genuine content issue and propagates as ContentFilterError (→ rephrase).
      if (engine.family === 'flux') {
        console.warn(`[falimg] flux refused (content policy) → nano-banana fallback for this image`)
        return await generateImageFal({ ...params, engine: GEMINI_IMAGE_ENGINE })
      }
      throw new ContentFilterError(params.prompt, String((err as Record<string, unknown>)['message'] ?? err))
    }
    if (isFalRateLimit(err)) throw new ProviderRateLimitError('fal')
    if (err instanceof ContentFilterError || err instanceof ProviderError) throw err
    // Surface fal's validation detail (which field it rejected) — otherwise it's an opaque "Unprocessable Entity".
    // Carry the HTTP status so a deterministic 4xx fails fast in the dispatcher instead of being re-billed.
    const body = err && typeof err === 'object' ? (err as Record<string, unknown>)['body'] : undefined
    const status = err && typeof err === 'object' ? Number((err as Record<string, unknown>)['status'] ?? 0) : 0
    throw new ProviderError('fal', body ? `${String(err)}: ${JSON.stringify(body)}` : String(err), status || undefined)
  }
}
