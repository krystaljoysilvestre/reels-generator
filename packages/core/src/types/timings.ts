import { z } from 'zod'

// AlignedChar — one Unicode code point with its audio start/end in ms.
// Produced by TtsProvider.synthesize(); consumed by compute_timings.
export const AlignedCharSchema = z.object({
  ch: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})
export type AlignedChar = z.infer<typeof AlignedCharSchema>

// Output of compute_timings (docs/08). Persisted as reels.timings jsonb.

export const SceneTimingSchema = z.object({
  idx: z.number().int().nonnegative(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  tier: z.enum(['still', 'video']),
})
export type SceneTiming = z.infer<typeof SceneTimingSchema>

// One word within a subtitle chunk, with its own audio start/end — enables
// per-word "karaoke" highlight in the renderer (word-mode caption styles).
export const SubtitleWordSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
})
export type SubtitleWord = z.infer<typeof SubtitleWordSchema>

export const SubtitleChunkSchema = z.object({
  text: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  words: z.array(SubtitleWordSchema).default([]), // per-word timings (for word-highlight captions)
})
export type SubtitleChunk = z.infer<typeof SubtitleChunkSchema>

export const SfxEventSchema = z.object({
  anchor: z.string(),
  prompt: z.string(),
  atMs: z.number().int().nonnegative(),
  volumeDb: z.number(),
})
export type SfxEvent = z.infer<typeof SfxEventSchema>

export const MusicTimingSchema = z.object({
  type: z.enum(['low_drone', 'drone_swell', 'riser_sting']),
  startAnchorMs: z.number().int().nonnegative(),
  peakAnchorMs: z.number().int().positive(),
})
export type MusicTiming = z.infer<typeof MusicTimingSchema>

export const SilenceDropTimingSchema = z.object({
  atMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
})
export type SilenceDropTiming = z.infer<typeof SilenceDropTimingSchema>

export const TimingsSchema = z.object({
  durationMs: z.number().int().positive(),
  scenes: z.array(SceneTimingSchema),
  subtitles: z.array(SubtitleChunkSchema),
  sfxEvents: z.array(SfxEventSchema),
  music: MusicTimingSchema.nullable(),
  silenceDrop: SilenceDropTimingSchema.nullable(),
  warnings: z.array(z.string()),
})
export type Timings = z.infer<typeof TimingsSchema>
