// Image generation recipe — the SINGLE source of truth for how a scene image is rendered, shared by
// scene generation, the in-editor regenerate, AND the onboarding style previews. They MUST share these
// so the preview an operator approves at creation renders identically to the scenes they later get.

export const SCENE_IMAGE_MODEL = 'gpt-image-1'

// Quality knob: 'low' | 'medium' | 'high'. Medium balances fidelity against per-image cost; 'high' roughly
// triples the spend. Used for scenes, regenerate, and previews alike so they never visually drift.
export type ImageQuality = 'low' | 'medium' | 'high'
export const SCENE_IMAGE_QUALITY: ImageQuality = 'medium'

// gpt-image-1 supports a fixed set of sizes. Reels are vertical, so 9:16 maps to the tallest portrait
// (1024x1536, a 2:3 frame) — slightly less tall than true 9:16, cropped to fill 1080x1920 at render.
export const ASPECT_TO_OPENAI_SIZE: Record<string, '1024x1024' | '1024x1536' | '1536x1024'> = {
  '9:16': '1024x1536',
  '4:3': '1024x1536',
  '1:1': '1024x1024',
  '16:9': '1536x1024',
}

// Cost estimates (cents/image) by quality at portrait size. Token-billed by OpenAI — re-verify at build.
export const OPENAI_IMAGE_COST_CENTS: Record<ImageQuality, number> = {
  low: 2,
  medium: 6,
  high: 16,
}

// OpenAI moderation rejection signals — surfaced as APIError (status 400) with these codes/markers.
export const OPENAI_CONTENT_FILTER_MARKERS = [
  'moderation_blocked',
  'content_policy_violation',
  'safety system',
  'safety_violation',
]
