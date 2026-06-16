import { z } from 'zod'

// Mirrors the audioscript.v1 JSON schema (docs/04 §3).

export const SfxCueSchema = z.object({
  anchor: z.string().min(1),
  offsetMs: z.number().int().default(0),
  prompt: z.string().min(1),
  volumeDb: z.number().default(-8),
})
export type SfxCue = z.infer<typeof SfxCueSchema>

export const AmbientSchema = z.object({
  packTags: z.array(z.string()).min(1),
  evolution: z
    .object({ anchor: z.string().min(1), change: z.string().min(1) })
    .nullable()
    .default(null),
})
export type Ambient = z.infer<typeof AmbientSchema>

export const MusicCueSchema = z.object({
  type: z.enum(['low_drone', 'drone_swell', 'riser_sting']),
  startAnchor: z.string().default(''),      // '' = start at 0 (intro)
  peakAnchor: z.string().default(''),       // '' = fall back to twist_anchor
  moodTags: z.array(z.string()).default([]),
})
export type MusicCue = z.infer<typeof MusicCueSchema>

export const SilenceDropSchema = z.object({
  anchor: z.string().min(1),
  durationMs: z.number().int().positive(),
})
export type SilenceDrop = z.infer<typeof SilenceDropSchema>

export const AudioScriptSchema = z.object({
  ambient: AmbientSchema,
  sfx: z.array(SfxCueSchema).max(7),
  silenceDrop: SilenceDropSchema.nullable().default(null),
  music: MusicCueSchema.nullable().default(null),
})
export type AudioScript = z.infer<typeof AudioScriptSchema>
