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
  // The word this line lands on — the one a caption preset accents, highlights or glows.
  // Optional and normally absent: the renderer derives it from delivery (see pickEmphasis).
  // Setting it here OVERRIDES that, which is the seam a creator edit or a marking pass uses.
  emphasis: z.boolean().optional(),
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
  // Sustained cue: the loop runs from atMs until endMs (resolved from the cue's endAnchor). Absent = point cue.
  endMs: z.number().int().nonnegative().optional(),
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

export const EndingTimingSchema = z.object({
  startMs: z.number().int().nonnegative(),
  voiceEndMs: z.number().int().positive(),
  endMs: z.number().int().positive(),
  focus: z.enum(['music', 'ambience', 'silence']),
  shape: z.enum(['button', 'resolve', 'ring_out']),
})
export type EndingTiming = z.infer<typeof EndingTimingSchema>

export const TimingsSchema = z.object({
  durationMs: z.number().int().positive(),
  scenes: z.array(SceneTimingSchema),
  subtitles: z.array(SubtitleChunkSchema),
  sfxEvents: z.array(SfxEventSchema),
  music: MusicTimingSchema.nullable(),
  silenceDrop: SilenceDropTimingSchema.nullable(),
  // How much of durationMs is the outro tail — the held closing beat AFTER the last spoken word
  // (compute-timings §4.65). The mixer resolves the music bed across it instead of hard-cutting at
  // full level. Optional so timings persisted before the tail existed still parse.
  outroTailMs: z.number().int().nonnegative().optional(),
  // Explicit ending direction, resolved from AudioScript. New mixes use this instead of inferring the
  // voice boundary from total duration (which is wrong when a climax ring-out extends the reel).
  ending: EndingTimingSchema.nullable().optional(),
  warnings: z.array(z.string()),
})
export type Timings = z.infer<typeof TimingsSchema>
