// Plain TypeScript types (no JSX) — safe to import from non-React packages.
// CaptionStyle is imported as a type-only (erased at compile time) so the
// Remotion browser bundle stays free of core's zod runtime.
import type { CaptionStyle } from '@reels/core'

export type { CaptionStyle }

export interface ReelScene {
  idx: number
  imageSrc: string
  videoSrc: string | null
  tier: 'still' | 'video'
  startFrame: number
  durationFrames: number
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
