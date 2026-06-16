import { z } from 'zod'

// Engine is chosen by config, not code — swap is data, not a code change. (docs/01 §6.2)
// Re-verify model IDs + pricing at build [M6]. These are valid as of June 2026.

export const FalEngineSchema = z.object({
  imageModelId: z.string().default('fal-ai/flux/schnell'),  // Flux Schnell for cost; swap to flux/dev for quality
  videoModelId: z.string().default('fal-ai/kling-video/v1.6/image-to-video'),  // Kling 3.0 equivalent
  videoFallbackModelId: z.string().default('fal-ai/wan-i2v'), // Budget Wan fallback
})
export type FalEngine = z.infer<typeof FalEngineSchema>

// Cost estimates (USD) as of June 2026 — re-verify at build [M6]
export const FAL_IMAGE_COST_CENTS = 4      // ~$0.04/image, Flux Schnell
export const FAL_IMAGE_COST_CENTS_DEV = 8  // ~$0.08/image, Flux Dev
export const FAL_VIDEO_COST_CENTS_PER_SEC = 10  // ~$0.10/sec, Kling
export const FAL_VIDEO_COST_CENTS_PER_SEC_BUDGET = 5  // ~$0.05/sec, Wan

// Content-filter rejection signal from fal.ai — confirmed catchable [H7]
// fal returns HTTP 422 with "content_policy_violation" in error.type
export const FAL_CONTENT_FILTER_CODES = new Set([
  'content_policy_violation',
  'safety_check_failed',
  'nsfw_detected',
])
