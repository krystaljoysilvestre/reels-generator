import { z } from 'zod'

// Mirrors the audioscript.v1 JSON schema (docs/04 §3).

// SFX assets are capped by ElevenLabs at ~22s; nothing shorter than a beat is worth a call.
const SFX_MIN_DURATION_SEC = 1
const SFX_MAX_DURATION_SEC = 22
// Per-cue loudness bounds. The floor keeps a "barely there" texture from vanishing entirely; the ceiling
// lets the emotional climax punch hard above the narrator. Ceiling is +9 (owner 2026-07-10: wanted the
// jumpscare louder/more traumatic) — only the deterministic climax uses the top; the designer's own cues
// target roughly -16..+6 per the prompt.
const SFX_MIN_VOLUME_DB = -30
const SFX_MAX_VOLUME_DB = 9

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export const SfxCueSchema = z.object({
  anchor: z.string().min(1),
  offsetMs: z.number().int().default(0),
  prompt: z.string().min(1),
  // Clamp (not .min/.max) so one over-eager LLM value never fails the whole design parse.
  volumeDb: z
    .number()
    .default(-8)
    .transform((v) => clamp(v, SFX_MIN_VOLUME_DB, SFX_MAX_VOLUME_DB)),
  // true = the sound BUILDS to its hit (riser/swell/crescendo), so the mixer places it to land its
  // impact ON the anchor word (shifted earlier by its detected transient). false = instant one-shot
  // (knock, slam) that fires on the anchor. Keeps a build-to-hit climax cue in sync with the twist beat.
  impactAtEnd: z.boolean().default(false),
  // Intent, not truth — ElevenLabs isn't sample-accurate, so 10.8s back for 11s asked is fine. Absent =
  // legacy behavior (the generator falls back to impactAtEnd ? 3 : 2), so cached designs are unaffected.
  targetDurationSec: z
    .number()
    .optional()
    .transform((v) => (v == null ? undefined : clamp(v, SFX_MIN_DURATION_SEC, SFX_MAX_DURATION_SEC))),
  // SUSTAINED cue: when set, this cue is a loopable texture that runs FROM `anchor` UNTIL the end of
  // `endAnchor` (a later verbatim narration substring) — a heartbeat under a whole walk, corridor tone
  // under a scene, rain under a stretch. The generator requests a seamless loop; the mixer loops it
  // across the span with a fade in/out. Absent = ordinary point cue (fires once at its anchor).
  endAnchor: z.string().optional(),
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

// Creative intent for the closing phrase. Direction chooses WHAT carries the ending and its shape;
// compute_timings resolves the anchor, and the renderer owns every millisecond / gain curve. Optional so
// persisted pre-direction scripts remain readable during migration.
export const EndingIntentSchema = z.object({
  anchor: z.string().min(1),
  focus: z.enum(['music', 'ambience', 'silence']),
  shape: z.enum(['button', 'resolve', 'ring_out']),
})
export type EndingIntent = z.infer<typeof EndingIntentSchema>

export const AudioScriptSchema = z.object({
  ambient: AmbientSchema,
  // Ceiling only (dense quiet realism = many low cues); the designer places what the place needs, not a quota.
  sfx: z.array(SfxCueSchema).max(18),
  silenceDrop: SilenceDropSchema.nullable().default(null),
  music: MusicCueSchema.nullable().default(null),
  ending: EndingIntentSchema.nullable().optional(),
})
export type AudioScript = z.infer<typeof AudioScriptSchema>
