import { z } from 'zod'

// ── Camera moves ──────────────────────────────────────────────────────────────
// Friendly, finite cinematic vocabulary shown to creators. Each maps to the motion text the animator
// reads — the raw prompt stays hidden. The LLM picks one per scene at breakdown (the default); the
// creator can override in the storyboard.
export const CAMERA_MOVES = [
  { key: 'drift', label: 'Slow drift', prompt: 'slow, subtle cinematic drift' },
  { key: 'push_in', label: 'Push in', prompt: 'slow cinematic push-in toward the subject' },
  { key: 'pull_out', label: 'Pull out', prompt: 'slow cinematic pull-back revealing the scene' },
  { key: 'pan_left', label: 'Pan left', prompt: 'smooth camera pan to the left' },
  { key: 'pan_right', label: 'Pan right', prompt: 'smooth camera pan to the right' },
  { key: 'tilt_up', label: 'Tilt up', prompt: 'slow camera tilt upward' },
  { key: 'tilt_down', label: 'Tilt down', prompt: 'slow camera tilt downward' },
  { key: 'handheld', label: 'Handheld', prompt: 'subtle handheld camera shake, documentary feel' },
  { key: 'locked', label: 'Locked off', prompt: 'locked-off camera, very minimal motion' },
] as const
export type CameraMoveKey = (typeof CAMERA_MOVES)[number]['key']
// Non-empty tuple of keys for z.enum() in the scene-breakdown schema.
export const CAMERA_MOVE_KEYS = CAMERA_MOVES.map((m) => m.key) as [CameraMoveKey, ...CameraMoveKey[]]

export const INTENSITIES = [
  { key: 'subtle', label: 'Subtle', suffix: ', very subtle' },
  { key: 'normal', label: 'Normal', suffix: '' },
  { key: 'strong', label: 'Strong', suffix: ', strong and dramatic' },
] as const
export type IntensityKey = (typeof INTENSITIES)[number]['key']

// A camera-move key → the motion text fed to the animator (falls back to the first move).
export function cameraMovePrompt(key: string | null | undefined): string {
  return CAMERA_MOVES.find((m) => m.key === key)?.prompt ?? CAMERA_MOVES[0].prompt
}

// Camera move + intensity round-trip through the single motionPrompt text: the move is the prefix, the
// intensity an optional suffix. An empty result = Auto (the animator uses its own default).
export function parseMotion(text: string | null | undefined): { moveKey: string; intensity: IntensityKey } {
  const t = text ?? ''
  const move = CAMERA_MOVES.find((m) => t.startsWith(m.prompt))
  const intensity = (INTENSITIES.find((i) => i.suffix && t.endsWith(i.suffix))?.key ?? 'normal') as IntensityKey
  return { moveKey: move?.key ?? '', intensity }
}
export function composeMotion(moveKey: string, intensity: IntensityKey): string {
  const base = CAMERA_MOVES.find((m) => m.key === moveKey)?.prompt
  if (!base) return ''
  return base + (INTENSITIES.find((i) => i.key === intensity)?.suffix ?? '')
}

// ── Motion settings (quality + length) ─────────────────────────────────────────
// Stored as jsonb on a scene; read by both the on-demand preview and the render-time animate step.
// 'budget' uses the cheaper/faster fallback model (~half the cost). Kling supports 5s or 10s; the budget
// model is 5s only — callers should clamp accordingly.
export const MotionSettingsSchema = z.object({
  quality: z.enum(['standard', 'budget']).default('standard'),
  durationSec: z.union([z.literal(5), z.literal(10)]).default(5),
})
export type MotionSettings = z.infer<typeof MotionSettingsSchema>
export const DEFAULT_MOTION_SETTINGS: MotionSettings = { quality: 'standard', durationSec: 5 }

// Tolerant resolver for the jsonb column (null/unknown → defaults). Budget model is 5s only.
export function resolveMotionSettings(raw: unknown): MotionSettings {
  const parsed = MotionSettingsSchema.safeParse(raw ?? {})
  const s = parsed.success ? parsed.data : DEFAULT_MOTION_SETTINGS
  return s.quality === 'budget' ? { ...s, durationSec: 5 } : s
}

// Per-second cost in cents, mirroring the provider's tiers (Kling 10¢/s, budget 5¢/s).
export function motionCostCents(s: MotionSettings): number {
  return (s.quality === 'budget' ? 5 : 10) * s.durationSec
}
