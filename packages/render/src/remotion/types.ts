// Plain TypeScript types (no JSX) — safe to import from non-React packages.
// CaptionStyle is imported as a type-only (erased at compile time) so the
// Remotion browser bundle stays free of core's zod runtime.
import type { CaptionStyle } from '@reels/core'

export type { CaptionStyle }

// Per-scene video effects, chosen by the worker (planSceneEffects) from the scene's mood + channel genre.
// Rendered at composite time in Remotion (free — no AI/API cost). intensity is 0–1.
export type SceneEffectType = 'zoom' | 'shake' | 'glitch' | 'flash' | 'vhs'
export interface SceneEffect {
  type: SceneEffectType
  intensity: number
}

export interface ReelScene {
  idx: number
  imageSrc: string
  videoSrc: string | null
  tier: 'still' | 'video'
  startFrame: number
  durationFrames: number
  mood: string[] // ambient/grade hints from breakdown — drives per-scene atmosphere intensity
  onScreenText?: string | null // optional title/overlay burned on this scene, separate from captions
  effects?: SceneEffect[] // per-scene video effects (zoom/shake/glitch/flash/vhs)
  // The director's chosen camera move for this still (push_in, pull_out, pan_left, locked, …). Drives the
  // Ken Burns motion so a still honours the same intent the breakdown picked. null/unknown → idx-cycled
  // default. Ignored for video scenes (the i2v clip already carries the move).
  cameraMove: string | null
  // Native length (s) of this scene's i2v clip, so render can stretch it to fill a longer scene span
  // instead of freezing on the last frame. null for stills.
  videoDurationSec: number | null
}

// One word within a chunk — drives the word-by-word "karaoke" highlight.
export interface SubtitleWord {
  text: string
  startMs: number
  endMs: number
}

export interface SubtitleChunk {
  text: string
  startMs: number
  endMs: number
  words: SubtitleWord[]
}

export interface ReelCompositionProps extends Record<string, unknown> {
  scenes: ReelScene[]
  subtitles: SubtitleChunk[]
  captionStyle: CaptionStyle
  captionSafeZonePct: number // platform caption safe-zone (% of frame height kept clear of platform UI)
  grain: number
  vignette: number
}
