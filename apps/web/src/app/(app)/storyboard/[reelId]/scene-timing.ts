import type { InferSelectModel } from 'drizzle-orm'
import type { scenes } from '@reels/db'

type Scene = InferSelectModel<typeof scenes>

// ── Where each scene sits in the reel ────────────────────────────────────────────
// The storyboard's timeline is duration-PROPORTIONAL (a 19s scene is twice the width of a 9s one), so
// every surface that draws the reel's shape — the timeline clips, the ruler, the stage's position bar —
// has to agree on how long a scene runs. That agreement lives here.
//
// The figure is an ESTIMATE from the narration, at the same ~2.5 words/second the rest of the app uses
// for runtime. It has to be: a still scene has no clip to measure, and the true length is only known once
// TTS has spoken the line. A motion scene's generated clip carries a real duration, but only the browser
// can read it (see MotionDurationChip) — mixing measured and estimated lengths would make the clips shift
// width as previews load, so the layout stays on one consistent basis.

/** Estimated seconds this scene runs, from its narration. Never 0 — a clip needs a width. */
export function sceneSeconds(scene: Scene): number {
  const words = scene.narrationText.split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 2.5))
}

/** Total estimated runtime across the reel. */
export function totalSeconds(list: Scene[]): number {
  return list.reduce((n, s) => n + sceneSeconds(s), 0)
}

/** Each scene's start offset in seconds, keyed by scene idx (scene 1 starts at 0). */
export function sceneStarts(list: Scene[]): Record<number, number> {
  const starts: Record<number, number> = {}
  let acc = 0
  for (const s of list) {
    starts[s.idx] = acc
    acc += sceneSeconds(s)
  }
  return starts
}

/** m:ss — the transport readout and the ruler's ticks. */
export function fmtClock(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.round(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Finished-cut runtime: measured media wins, then persisted render timing, then storyboard estimate. */
export function displayDurationSeconds(
  mediaSecs: number | null,
  timedSecs: number | null,
  estimatedSecs: number,
): number {
  if (mediaSecs != null && Number.isFinite(mediaSecs) && mediaSecs > 0) return mediaSecs
  if (timedSecs != null && Number.isFinite(timedSecs) && timedSecs > 0) return timedSecs
  return estimatedSecs
}

/** Five evenly-spaced ruler labels across the reel: 0, ¼, ½, ¾, end. */
export function rulerTicks(total: number): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => fmtClock(total * f))
}
