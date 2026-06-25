// Per-reel video effects — composited at render time in Remotion (free; no API cost). The operator can
// pick a set on the storyboard (reel.videoEffects = string[]), or leave it null for AUTO (the worker
// plans effects from the story's mood + channel genre). This module is the shared source of truth for the
// option list, default intensities, and the selection→effects resolver — used by the picker UI and render.

export type VideoEffectId = 'zoom' | 'shake' | 'glitch' | 'flash' | 'vhs'

export interface VideoEffectOption {
  id: VideoEffectId
  label: string
  hint: string
}

export const VIDEO_EFFECTS: VideoEffectOption[] = [
  { id: 'zoom', label: 'Zoom', hint: 'Slow push-in on still scenes' },
  { id: 'vhs', label: 'VHS', hint: 'Degraded-tape scanlines + grain' },
  { id: 'glitch', label: 'Glitch', hint: 'Digital jolts + RGB split' },
  { id: 'shake', label: 'Shake', hint: 'Handheld camera jitter' },
  { id: 'flash', label: 'Flash', hint: 'Hard cut-flash on each scene' },
]

// Moderate defaults for operator-selected effects (the auto planner sets its own per-beat intensities).
const DEFAULT_INTENSITY: Record<VideoEffectId, number> = {
  zoom: 0.5,
  vhs: 0.55,
  glitch: 0.6,
  shake: 0.4,
  flash: 0.55,
}

export function isVideoEffectId(s: string): s is VideoEffectId {
  return VIDEO_EFFECTS.some((e) => e.id === s)
}

// Resolve an operator selection into per-scene effects. zoom only applies to stills (video tiers already
// move); everything else applies to the scene as chosen.
export function effectsFromSelection(
  selection: string[],
  tier: 'still' | 'video',
): Array<{ type: VideoEffectId; intensity: number }> {
  return selection
    .filter(isVideoEffectId)
    .filter((id) => id !== 'zoom' || tier === 'still')
    .map((id) => ({ type: id, intensity: DEFAULT_INTENSITY[id] }))
}
