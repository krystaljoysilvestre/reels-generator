import { z } from 'zod'

export const ToneConfigSchema = z.object({
  suspense: z.number().int().min(0).max(10).default(7),
  dread: z.number().int().min(0).max(10).default(8),
  pacing: z.number().int().min(0).max(10).default(6),
  gore: z.number().int().min(0).max(10).default(2),
  humor: z.number().int().min(0).max(10).default(1),
})
export type ToneConfig = z.infer<typeof ToneConfigSchema>

export const WorldBibleSchema = z.object({
  region: z.string(),
  era: z.string(),
  canonLocations: z.array(z.string()).default([]),
  canonObjects: z.array(z.string()).default([]),
  vocabulary: z.record(z.string(), z.string()).default({}),
})
export type WorldBible = z.infer<typeof WorldBibleSchema>

export const LutConfigSchema = z.object({
  lutPath: z.string().optional(),
  grain: z.number().min(0).max(1).default(0.15),
  vignette: z.number().min(0).max(1).default(0.25),
})
export type LutConfig = z.infer<typeof LutConfigSchema>

export const VoiceSchema = z.object({
  id: z.string(),
  providerId: z.string(),      // ElevenLabs voice ID
  name: z.string(),
  gender: z.enum(['m', 'f', 'neutral']),
  style: z.string(),           // e.g. "soft, hesitant"
  languages: z.array(z.string()),
})
export type Voice = z.infer<typeof VoiceSchema>

// A real ElevenLabs voice selected for a channel. Metadata is read-only
// (sourced from the provider); we just store the selection.
export const ChannelVoiceSchema = z.object({
  providerId: z.string(),      // ElevenLabs voice_id
  name: z.string(),
  gender: z.string(),
  description: z.string().default(''),
})
export type ChannelVoice = z.infer<typeof ChannelVoiceSchema>

export const VoiceModeSchema = z.enum(['single', 'per_story'])
export type VoiceMode = z.infer<typeof VoiceModeSchema>

export const MusicTrackSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.enum(['low_drone', 'drone_swell', 'riser_sting']),
  peakFrac: z.number().min(0).max(1),  // 0 = no inherent build (drone); docs/07
  moodTags: z.array(z.string()),
})
export type MusicTrack = z.infer<typeof MusicTrackSchema>

export const AudioPacksSchema = z.object({
  ambientPacks: z.record(z.string(), z.array(z.string())).default({}),
  musicPack: z.array(MusicTrackSchema).default([]),
})
export type AudioPacks = z.infer<typeof AudioPacksSchema>

export const PostingRulesSchema = z.object({
  platforms: z.array(z.enum(['fb', 'ig', 'yt', 'tiktok'])).default(['fb']),
  scheduleUtcHour: z.number().int().min(0).max(23).default(13), // 9PM PHT = 13:00 UTC
  qualityThreshold: z.number().min(0).max(10).default(0),       // 0 = no auto-filter in Phase 1
})
export type PostingRules = z.infer<typeof PostingRulesSchema>
