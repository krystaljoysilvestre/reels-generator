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

// Compose the animator's motion prompt from the director's picks. The SUBJECT's own motion (if any — a
// horror scare/reveal where the threat itself moves, e.g. a grin stretching wider) LEADS, the CAMERA move
// FOLLOWS, so i2v animates the threat and not just the frame. Empty subjectMotion → just the camera phrase
// (unchanged behavior — this is the common case and every still). Video beats only; a still's stored prompt
// stays a bare camera phrase so render-time parseMotion() can still recover its Ken Burns move.
export function animatorMotionPrompt(cameraMoveKey: string | null | undefined, subjectMotion?: string | null): string {
  const camera = cameraMovePrompt(cameraMoveKey)
  const subject = (subjectMotion ?? '').trim()
  return subject ? `${subject}; ${camera}` : camera
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

// ── Motion settings (clip length) ──────────────────────────────────────────────
// Stored as jsonb on a scene; read by both the on-demand preview and the render-time animate step.
// Kling v2.5 supports 5s or 10s clips.
export const MotionSettingsSchema = z.object({
  durationSec: z.union([z.literal(5), z.literal(10)]).default(5),
})
export type MotionSettings = z.infer<typeof MotionSettingsSchema>
export const DEFAULT_MOTION_SETTINGS: MotionSettings = { durationSec: 5 }

// Tolerant resolver for the jsonb column (null/unknown → defaults).
export function resolveMotionSettings(raw: unknown): MotionSettings {
  const parsed = MotionSettingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : DEFAULT_MOTION_SETTINGS
}

// Per-second cost in cents (Kling v2.5 Turbo Pro, ~7¢/s). Keep in sync with
// FAL_VIDEO_COST_CENTS_PER_SEC in @reels/providers (core can't import providers).
export function motionCostCents(s: MotionSettings): number {
  return 7 * s.durationSec
}
