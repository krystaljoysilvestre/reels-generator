import { z } from 'zod'

// Engine is chosen by config, not code — swap is data, not a code change. (docs/01 §6.2)
// Re-verify model IDs + pricing at build [M6]. These are valid as of June 2026.

export const FalEngineSchema = z.object({
  imageModelId: z.string().default('fal-ai/flux/schnell'),  // Flux Schnell for cost; swap to flux/dev for quality
  // Kling i2v, standard tier (720p, ~10c/s). The bare `.../v1.6/image-to-video` path 404s on fal now —
  // the tier segment (`/standard/`) is required. Both this and the wan fallback verified working
  // 2026-06-20: on a photoreal scene each holds the style and gives a clean camera push-in (no warping).
  // Output is 720x1280 → upscaled to the 1080x1920 frame at render (objectFit cover). For native 1080p use
  // the `/pro/` tier (higher cost). i2v is only invoked for `tier:'video'` hero beats.
  videoModelId: z.string().default('fal-ai/kling-video/v1.6/standard/image-to-video'),
  videoFallbackModelId: z.string().default('fal-ai/wan-i2v'), // Budget Wan i2v (~5c/s, 720p) — verified working
})
export type FalEngine = z.infer<typeof FalEngineSchema>

// Canonical scene-image render recipe — the SINGLE source of truth for how a scene image is rendered,
// used by scene generation, the in-editor regenerate, AND the onboarding style previews. They MUST share
// these so the preview an operator approves at creation renders identically to the scenes they later get.
// (They drifted once — previews ran at guidance 4.5 and looked more stylized than the 3.5 scenes they sold.)
export const SCENE_IMAGE_MODEL_ID = 'fal-ai/flux/dev'  // flux/dev (not schnell) for palette + detail fidelity (~2× cost: 4¢→8¢)
export const SCENE_IMAGE_GUIDANCE = 3.5 // 4.0 was tried but flattened the look (lost the best shots) without helping adherence — kept at 3.5
export const SCENE_IMAGE_STEPS = 28

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
