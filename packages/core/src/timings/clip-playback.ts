// Clip playback math — the SINGLE source of truth for how an i2v clip's own (clip-relative) time maps to
// reel time. The renderer (SceneClip.tsx) slows a fixed 5s/10s clip to fill a longer scene span; the mixer
// must place foley on the SAME timeline or sync drifts. Both import these pure helpers so the formula can
// never diverge between render and mix.

// Playback rate the renderer applies to a video clip: slow it to fill the scene span, clamped to [0.5, 1]
// (never speed up — that drops content; never below 0.5 — an unnatural crawl). Mirrors SceneClip.tsx.
export function clipPlaybackRate(clipSec: number, sceneSec: number): number {
  if (sceneSec <= 0 || clipSec <= 0) return 1
  return Math.max(0.5, Math.min(1, clipSec / sceneSec))
}

// A clip-relative timestamp (ms into the raw clip) → reel-timeline ms. Playing at `rate` < 1 stretches the
// clip, so an event at clipMs lands at clipMs/rate after the scene starts.
export function clipMsToReelMs(sceneStartMs: number, clipMs: number, rate: number): number {
  const r = rate > 0 ? rate : 1
  return Math.round(sceneStartMs + clipMs / r)
}

// The reel-time point past which the clip is no longer showing NEW motion — either the stretched clip has
// run out (its last frame freezes) or the scene itself ended. Foley placed after this would fire over a
// frozen/absent frame, so callers drop events beyond it.
export function clipVisibleEndMs(sceneStartMs: number, sceneEndMs: number, clipSec: number, rate: number): number {
  const r = rate > 0 ? rate : 1
  const stretchedEnd = sceneStartMs + (clipSec / r) * 1000
  return Math.min(sceneEndMs, stretchedEnd)
}
