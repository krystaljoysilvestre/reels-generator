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

// Frame range over which a video scene's FROZEN tail should keep pushing, or null when there is no frozen
// tail to rescue. Once a stretched clip runs out, OffthreadVideo holds its last frame — tolerable mid-reel,
// dead on the final scene, whose held outro beat (compute-timings §4.65) would land on a motionless frame.
// So the renderer keeps a slow push alive across the freeze.
//
// Returns null when the clip fills the scene (no freeze) or the freeze is too short to animate. That guard
// is the point: a zero-width range makes Remotion's interpolate() throw
// ("inputRange must be strictly monotonically increasing"), which failed a real render — the clip finished
// on exactly the scene's last frame, so start === end.
export function freezePushFrames(clipSec: number, sceneSec: number, fps: number): { from: number; to: number } | null {
  if (fps <= 0 || sceneSec <= 0 || clipSec <= 0) return null
  const rate = clipPlaybackRate(clipSec, sceneSec)
  const from = Math.round((clipSec / rate) * fps)
  const to = Math.round(sceneSec * fps)
  // need at least a few frames of freeze for a push to read as motion rather than a jolt
  return to - from >= 3 ? { from, to } : null
}

// The reel-time point past which the clip is no longer showing NEW motion — either the stretched clip has
// run out (its last frame freezes) or the scene itself ended. Foley placed after this would fire over a
// frozen/absent frame, so callers drop events beyond it.
export function clipVisibleEndMs(sceneStartMs: number, sceneEndMs: number, clipSec: number, rate: number): number {
  const r = rate > 0 ? rate : 1
  const stretchedEnd = sceneStartMs + (clipSec / r) * 1000
  return Math.min(sceneEndMs, stretchedEnd)
}
