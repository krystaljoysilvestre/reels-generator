// Plain TypeScript types (no JSX) — safe to import from non-React packages.

export interface ReelScene {
  idx: number
  imageSrc: string
  videoSrc: string | null
  tier: 'still' | 'video'
  startFrame: number
  durationFrames: number
}

export interface SubtitleChunk {
  text: string
  startMs: number
  endMs: number
}

export interface ReelCompositionProps extends Record<string, unknown> {
  scenes: ReelScene[]
  subtitles: SubtitleChunk[]
  grain: number
  vignette: number
}
