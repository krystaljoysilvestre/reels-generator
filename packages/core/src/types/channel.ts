import { z } from 'zod'
import { MusicMoodSchema } from '../audio/music-mood.js'

// Genre-neutral tone axes (work for any niche, not just horror):
//   intensity — light/easygoing → heavy/serious
//   warmth    — clinical/detached → warm/inviting
//   energy    — calm/measured → high-energy/hyped
//   pacing    — slow-burn → rapid
//   humor     — straight → comedic
export const ToneConfigSchema = z.object({
  intensity: z.number().int().min(0).max(10).default(5),
  warmth: z.number().int().min(0).max(10).default(5),
  energy: z.number().int().min(0).max(10).default(5),
  pacing: z.number().int().min(0).max(10).default(5),
  humor: z.number().int().min(0).max(10).default(3),
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

// ── Target platform ───────────────────────────────────────────────────────────
// Where this channel's videos are published. Each preset carries the frame (aspect +
// pixel dimensions), length cap, caption-safe zone (platform UI overlay), hook
// convention, and watermark norm. This is the SINGLE source of truth: the channel.v1
// derivation reads the hints to tailor caption + length; image/video generation and
// the renderer read aspect/width/height; render QA reads maxSeconds.
export const TargetPlatformSchema = z.enum(['tiktok', 'youtube_shorts', 'facebook_reels', 'youtube_long', 'all'])
export type TargetPlatform = z.infer<typeof TargetPlatformSchema>

export type AspectRatio = '9:16' | '16:9'

export interface PlatformPreset {
  label: string
  aspect: AspectRatio
  width: number                  // output frame px (Remotion composition + ffmpeg)
  height: number
  maxSeconds: number              // hard cap (export must fit this)
  sweetSpot: [number, number]     // recommended length range
  captionHint: string            // platform caption convention (derivation input)
  lengthHint: string             // platform length convention (derivation input)
  hookHint: string               // platform hook convention (story-gen input, later)
  safeZoneBottomPct: number      // % from bottom kept clear of platform UI (render, later)
  watermark: boolean             // burn the channel handle as a watermark (render, later)
}

// The absolute ceiling any channel's targetSeconds can take — the largest platform cap (YouTube
// long-form). Route schemas validate against THIS; the per-platform clamp happens after.
export const MAX_TARGET_SECONDS = 600

export const PLATFORM_PRESETS: Record<TargetPlatform, PlatformPreset> = {
  tiktok: {
    label: 'TikTok', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 180, sweetSpot: [21, 60],
    captionHint: 'big, bold, centered, word-by-word (pop/hype/impact) — high energy, reads on mute',
    lengthHint: '21–60s sweet spot (up to 180s allowed); keep it punchy',
    hookHint: 'instant pattern-interrupt in the first 1–2s with a bold on-screen text hook',
    safeZoneBottomPct: 18, watermark: false,
  },
  youtube_shorts: {
    label: 'YouTube Shorts', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 60, sweetSpot: [25, 55],
    captionHint: 'clean and legible, sitting a little higher to clear the bottom title/CTA UI',
    lengthHint: '60s hard cap; 25–55s ideal',
    hookHint: 'a clear curiosity/value promise in the first 3s, spoken and on-screen',
    safeZoneBottomPct: 14, watermark: false,
  },
  facebook_reels: {
    label: 'Facebook Reels', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 90, sweetSpot: [20, 60],
    captionHint: 'large, very high-contrast (older/mixed audience, almost always muted)',
    lengthHint: '90s cap; 20–60s ideal',
    hookHint: 'a relatable, story-led hook in the first 3s',
    safeZoneBottomPct: 20, watermark: false,
  },
  // Long-form YouTube (regular horizontal uploads, not Shorts). The 600s cap keeps the
  // narration near ElevenLabs' single-request comfort zone (see specs/long-form.md);
  // raise deliberately, with a listen test, not casually.
  youtube_long: {
    label: 'YouTube', aspect: '16:9', width: 1920, height: 1080, maxSeconds: 600, sweetSpot: [300, 480],
    captionHint: 'restrained cinematic subtitles on a subtle bar — long-form viewers usually have sound ON, so captions support rather than perform',
    lengthHint: '5–10 minutes; give the story room to breathe and escalate in chapters',
    hookHint: 'a cold-open hook in the first 20–30s that promises the payoff, then a fresh pull every minute or two',
    safeZoneBottomPct: 8, watermark: false,
  },
  all: {
    label: 'All platforms', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 60, sweetSpot: [20, 55],
    captionHint: 'safe, legible, centered — must read well on every platform',
    lengthHint: 'keep ≤60s so it fits Shorts everywhere; 20–55s ideal',
    hookHint: 'a strong, universal hook in the first 2–3s',
    safeZoneBottomPct: 18, watermark: false,
  },
}

// Per-channel burned-in caption style. The operator picks an expressive preset
// (AI-suggested per niche); the resolved params are stored and read by the renderer,
// which animates them word-by-word. These are built to compete with the captions you
// see on TikTok / Reels / Shorts — not plain subtitles.
export const CaptionPresetSchema = z.enum([
  'clean',     // refined documentary white — calm/educational
  'pop',       // TikTok word-by-word scale pop — general/lifestyle
  'hype',      // Hormozi/MrBeast highlight-box punch — business/motivation
  'karaoke',   // progressive word fill — music/poetry/lyric
  'neon',      // glowing word pop — gaming/tech/nightlife
  'whisper',   // eerie typewriter reveal — horror/mystery/true-crime
  'impact',    // huge punch-in with shake — news/sports/drama
  'elegant',   // wide-tracked fade — luxury/fashion/beauty/ASMR
  'comic',     // playful tilted word-pop — comedy/memes/reactions
  'terminal',  // green monospace typewriter on a panel — tech/coding/crypto/hacking
  'cinematic', // Netflix-style subtitle on a translucent bar — film/storytelling/video essays
  'breaking',  // bold solid lower-third news bar — news/sports/gossip/drama updates
  'marker',    // highlighter swipe under spoken words — study/tips/how-to/"save this"
  'script',    // flowing handwritten cursive fade — faith/quotes/wellness/relationships
  'retro',     // chrome/synthwave gradient with glow — retro gaming/80s/aesthetic/music
  'glitch',    // RGB-split datamosh on the spoken word — gaming/cyber/AI/edits
])
export type CaptionPreset = z.infer<typeof CaptionPresetSchema>

// Signature motion of a preset. The renderer + the in-app preview both read this.
//   fade        — whole line eases up + in (block)
//   pop         — each word scales in with overshoot (word)
//   bounce      — each word drops in with spring (word)
//   karaoke     — upcoming words dimmed, spoken words fill with accent (word)
//   typewriter  — characters reveal one-by-one with a cursor (block)
//   highlight_box — spoken word sits in a filled accent box, Hormozi-style (word)
//   punch       — spoken word punches in oversized then settles + shakes (word)
//   marker      — a highlighter stroke wipes in behind the spoken word (word)
//   glitch      — spoken word gets an RGB-split datamosh jitter (word)
//   comic       — words pop in with a playful alternating tilt (word)
//   none        — static
export const CaptionAnimationSchema = z.enum([
  'fade', 'pop', 'bounce', 'karaoke', 'typewriter', 'highlight_box', 'punch',
  'marker', 'glitch', 'comic', 'none',
])
export type CaptionAnimation = z.infer<typeof CaptionAnimationSchema>

export const CaptionShadowSchema = z.enum(['none', 'soft', 'hard', 'glow'])
export type CaptionShadow = z.infer<typeof CaptionShadowSchema>

export const CaptionStyleSchema = z.object({
  preset: CaptionPresetSchema.default('clean'),
  mode: z.enum(['block', 'word']).default('word'), // word = per-word treatment/animation
  animation: CaptionAnimationSchema.default('fade'),
  fontFamily: z.string().default('Inter, Arial, sans-serif'),
  fontWeight: z.number().int().min(300).max(900).default(800),
  fontSizePx: z.number().int().min(24).max(150).default(58), // at 1080×1920
  uppercase: z.boolean().default(false),
  italic: z.boolean().default(false),
  letterSpacingEm: z.number().min(-0.05).max(0.5).default(0),
  color: z.string().default('#ffffff'),          // base / not-yet-spoken words
  activeColor: z.string().default('#ffffff'),     // spoken word text (e.g. dark on a box)
  highlightColor: z.string().default('#ffe34d'),  // accent: box fill / karaoke fill / glow
  stroke: z
    .object({
      color: z.string().default('#000000'),
      widthPx: z.number().min(0).max(24).default(8), // outline at 1080×1920
    })
    .default({}),
  shadow: CaptionShadowSchema.default('hard'),
  position: z.enum(['bottom', 'center', 'top']).default('bottom'),
  rotationDeg: z.number().min(-8).max(8).default(0), // slight tilt for energy
  // Optional panel behind the whole line: 'bar' = translucent dark plate (cinematic /
  // terminal), 'block' = solid highlightColor lower-third (breaking-news). Absent = none.
  backplate: z.enum(['none', 'bar', 'block']).optional(),
  // Optional gradient text fill (chrome / synthwave). When set, overrides the flat color.
  gradient: z.object({ from: z.string(), to: z.string() }).optional(),
})
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>

// Concrete params per preset. `highlightColor` may be overridden (e.g. AI-derived per niche).
// Font stacks end in a generic family so the headless render host always has a fallback.
export const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyle> = {
  clean: {
    preset: 'clean', mode: 'block', animation: 'fade',
    fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 700, fontSizePx: 50,
    uppercase: false, italic: false, letterSpacingEm: 0,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#7fd1ff',
    stroke: { color: '#000000', widthPx: 5 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
  },
  pop: {
    preset: 'pop', mode: 'word', animation: 'pop',
    fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSizePx: 62,
    uppercase: true, italic: false, letterSpacingEm: 0,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#ffd400',
    stroke: { color: '#000000', widthPx: 9 }, shadow: 'hard', position: 'bottom', rotationDeg: 0,
  },
  hype: {
    preset: 'hype', mode: 'word', animation: 'highlight_box',
    fontFamily: 'Montserrat, Inter, Arial, sans-serif', fontWeight: 900, fontSizePx: 66,
    uppercase: true, italic: false, letterSpacingEm: -0.01,
    color: '#ffffff', activeColor: '#0a0a0a', highlightColor: '#22e06b',
    stroke: { color: '#000000', widthPx: 10 }, shadow: 'hard', position: 'center', rotationDeg: 0,
  },
  karaoke: {
    preset: 'karaoke', mode: 'word', animation: 'karaoke',
    fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSizePx: 56,
    uppercase: false, italic: false, letterSpacingEm: 0,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#ff4d8d',
    stroke: { color: '#000000', widthPx: 7 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
  },
  neon: {
    preset: 'neon', mode: 'word', animation: 'pop',
    fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSizePx: 58,
    uppercase: true, italic: false, letterSpacingEm: 0.02,
    color: '#eafffb', activeColor: '#ffffff', highlightColor: '#19f0c3',
    stroke: { color: '#04221c', widthPx: 3 }, shadow: 'glow', position: 'center', rotationDeg: 0,
  },
  whisper: {
    preset: 'whisper', mode: 'block', animation: 'typewriter',
    fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 600, fontSizePx: 46,
    uppercase: false, italic: false, letterSpacingEm: 0.04,
    color: '#e9e7ea', activeColor: '#ffffff', highlightColor: '#c01616',
    stroke: { color: '#000000', widthPx: 4 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
  },
  impact: {
    preset: 'impact', mode: 'word', animation: 'punch',
    fontFamily: '"Arial Black", Impact, Inter, sans-serif', fontWeight: 900, fontSizePx: 74,
    uppercase: true, italic: false, letterSpacingEm: -0.02,
    color: '#ffffff', activeColor: '#ffe34d', highlightColor: '#ff2e2e',
    stroke: { color: '#000000', widthPx: 12 }, shadow: 'hard', position: 'center', rotationDeg: -2,
  },
  elegant: {
    preset: 'elegant', mode: 'block', animation: 'fade',
    fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 400, fontSizePx: 40,
    uppercase: false, italic: true, letterSpacingEm: 0.18,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#d9b46a',
    stroke: { color: '#000000', widthPx: 2 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
  },
  comic: {
    preset: 'comic', mode: 'word', animation: 'comic',
    fontFamily: '"Comic Sans MS", "Chalkboard SE", "Bangers", Inter, sans-serif', fontWeight: 800, fontSizePx: 60,
    uppercase: true, italic: false, letterSpacingEm: 0,
    color: '#ffffff', activeColor: '#111111', highlightColor: '#ff5fa2',
    stroke: { color: '#000000', widthPx: 9 }, shadow: 'hard', position: 'bottom', rotationDeg: 0,
  },
  terminal: {
    preset: 'terminal', mode: 'block', animation: 'typewriter',
    fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontWeight: 600, fontSizePx: 42,
    uppercase: false, italic: false, letterSpacingEm: 0.02,
    color: '#35ff9e', activeColor: '#ffffff', highlightColor: '#35ff9e',
    stroke: { color: '#04231a', widthPx: 2 }, shadow: 'glow', position: 'bottom', rotationDeg: 0,
    backplate: 'bar',
  },
  cinematic: {
    preset: 'cinematic', mode: 'block', animation: 'fade',
    fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 500, fontSizePx: 44,
    uppercase: false, italic: false, letterSpacingEm: 0,
    color: '#f2f2f2', activeColor: '#ffffff', highlightColor: '#cfd6e6',
    stroke: { color: '#000000', widthPx: 1 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
    backplate: 'bar',
  },
  breaking: {
    preset: 'breaking', mode: 'block', animation: 'fade',
    fontFamily: '"Arial Narrow", "Roboto Condensed", Inter, sans-serif', fontWeight: 800, fontSizePx: 48,
    uppercase: true, italic: false, letterSpacingEm: 0,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#e10600',
    stroke: { color: '#000000', widthPx: 1 }, shadow: 'soft', position: 'bottom', rotationDeg: 0,
    backplate: 'block',
  },
  marker: {
    preset: 'marker', mode: 'word', animation: 'marker',
    fontFamily: 'Inter, Helvetica, Arial, sans-serif', fontWeight: 800, fontSizePx: 56,
    uppercase: false, italic: false, letterSpacingEm: 0,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#ffe11a',
    stroke: { color: '#000000', widthPx: 6 }, shadow: 'hard', position: 'bottom', rotationDeg: 0,
  },
  script: {
    preset: 'script', mode: 'block', animation: 'fade',
    fontFamily: '"Snell Roundhand", "Brush Script MT", "Segoe Script", cursive', fontWeight: 500, fontSizePx: 52,
    uppercase: false, italic: false, letterSpacingEm: 0,
    color: '#fff7ef', activeColor: '#ffffff', highlightColor: '#ffd9a0',
    stroke: { color: '#000000', widthPx: 3 }, shadow: 'soft', position: 'center', rotationDeg: -1,
  },
  retro: {
    preset: 'retro', mode: 'block', animation: 'fade',
    fontFamily: '"Audiowide", "Orbitron", Inter, sans-serif', fontWeight: 800, fontSizePx: 56,
    uppercase: true, italic: false, letterSpacingEm: 0.06,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#f471b5',
    stroke: { color: '#1a0b2e', widthPx: 4 }, shadow: 'glow', position: 'center', rotationDeg: 0,
    gradient: { from: '#22d3ee', to: '#f471b5' },
  },
  glitch: {
    preset: 'glitch', mode: 'word', animation: 'glitch',
    fontFamily: '"Arial Black", Arial, Inter, sans-serif', fontWeight: 900, fontSizePx: 60,
    uppercase: true, italic: false, letterSpacingEm: 0.01,
    color: '#ffffff', activeColor: '#ffffff', highlightColor: '#00e5ff',
    stroke: { color: '#000000', widthPx: 5 }, shadow: 'hard', position: 'center', rotationDeg: 0,
  },
}

// Hybrid model: the AI picks a preset and may nudge a few SAFE, bounded knobs on top of
// it (brand accent, base text color, placement, a size multiplier). Everything else —
// the preset's signature motion, font, weight, stroke, shadow — stays fixed so the look
// can't be broken. Out-of-range values are clamped, never trusted blindly.
export interface CaptionTweaks {
  highlightColor?: string // accent: box fill / karaoke fill / glow / active word
  color?: string // base (not-yet-spoken) word color — keep high-contrast
  position?: CaptionStyle['position']
  fontScale?: number // multiplies the preset's base font size
}

export function resolveCaptionStyle(preset: CaptionPreset, tweaks: CaptionTweaks = {}): CaptionStyle {
  const base = CAPTION_PRESETS[preset] ?? CAPTION_PRESETS.clean
  const scaled = typeof tweaks.fontScale === 'number'
    ? Math.max(24, Math.min(150, Math.round(base.fontSizePx * tweaks.fontScale)))
    : base.fontSizePx
  // CaptionStyleSchema.parse is the final safety net — it validates/normalizes every field.
  return CaptionStyleSchema.parse({
    ...base,
    ...(tweaks.highlightColor ? { highlightColor: tweaks.highlightColor } : {}),
    ...(tweaks.color ? { color: tweaks.color } : {}),
    ...(tweaks.position ? { position: tweaks.position } : {}),
    fontSizePx: scaled,
  })
}

// Back-compat thin wrapper (accent-only tweak).
export function resolveCaptionPreset(preset: CaptionPreset, highlightColor?: string): CaptionStyle {
  return resolveCaptionStyle(preset, highlightColor ? { highlightColor } : {})
}

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
  // Apparent age band, for matching a narrator to a voice. Optional + dormant: existing pools have
  // no age, so age-matching is a no-op until voices are tagged (gender-matching works meanwhile).
  age: z.enum(['young', 'adult', 'older']).optional(),
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

// Generated/uploaded beds have no measured peak; estimate where the build sits from the type.
export function peakFracForType(type: MusicTrack['type']): number {
  return type === 'riser_sting' ? 0.85 : type === 'drone_swell' ? 0.7 : 0
}

// How loud the music bed sits — the Sound step maps this to mixer dB (see mix-audio).
export const MusicIntensitySchema = z.enum(['subtle', 'balanced', 'bold'])
export type MusicIntensity = z.infer<typeof MusicIntensitySchema>

// Bed/peak loudness — dB UNDER the reference voice (mix-audio.ts reference gain-staging, Phase A 2026-07-24).
// Was "relative to the -14 final" but applied to each provider's arbitrary bed loudness, so the bed actually
// landed ~22-27 dB under the voice (below the WCAG 20 dB floor → inaudible). These are now the TRUE voice-
// relative ratio: pro practice is ~9-15 dB under for present-but-secondary, ~18-20 for a deliberately calm
// bed. STARTING VALUES for the blind ear test — the founder's ear is the ratifier; move them here.
export function musicIntensityToDb(intensity: MusicIntensity): { bedDb: number; peakDb: number } {
  switch (intensity) {
    case 'subtle': return { bedDb: -19, peakDb: -11 } // calm registers (EBN documentary): present but restrained
    case 'bold': return { bedDb: -11, peakDb: -4 }    // energetic: bed forward, top of "present"
    default: return { bedDb: -15, peakDb: -7 }        // balanced: present-but-secondary
  }
}

// The derived brief for (re)generating the channel's signature bed.
export const AudioMoodSchema = z.object({
  prompt: z.string().default(''),
  type: z.enum(['low_drone', 'drone_swell', 'riser_sting']).default('low_drone'),
  moodTags: z.array(z.string()).default([]),
})
export type AudioMood = z.infer<typeof AudioMoodSchema>

// How the channel sources background music. 'ai' = generated per reel at render from the
// story + audioMood; 'preset'/'upload' = the fixed track in musicPack; 'none' = silent.
export const MusicModeSchema = z.enum(['ai', 'preset', 'upload', 'none'])
export type MusicMode = z.infer<typeof MusicModeSchema>

export const AudioPacksSchema = z.object({
  ambientPacks: z.record(z.string(), z.array(z.string())).default({}),
  musicPack: z.array(MusicTrackSchema).default([]),
  musicMode: MusicModeSchema.default('preset'),
  // SFX on/off + music loudness live in Settings (advanced), not onboarding. Defaults keep
  // channels created before the Sound step valid (SFX on, balanced).
  sfxEnabled: z.boolean().default(true),
  musicIntensity: MusicIntensitySchema.default('balanced'),
  // Channel-default background-music mood (operator dropdown). Unset → falls back to audioMood's arc+tags.
  musicMood: MusicMoodSchema.optional(),
  audioMood: AudioMoodSchema.optional(),
})
export type AudioPacks = z.infer<typeof AudioPacksSchema>

export const PostingRulesSchema = z.object({
  platforms: z.array(z.enum(['fb', 'ig', 'yt', 'tiktok'])).default(['fb']),
  scheduleUtcHour: z.number().int().min(0).max(23).default(13), // 9PM PHT = 13:00 UTC
  qualityThreshold: z.number().min(0).max(10).default(0),       // 0 = no auto-filter in Phase 1
  // The consistency engine: when enabled, the worker's hourly tick auto-creates reels on this cadence
  // (one per tick until the day's quota is met, starting at startHourUtc). Gates still behave per the
  // channel's generationMode — 'auto' runs to a finished render, 'review' queues stories for approval.
  // Posting itself stays manual (see export-post-package).
  autoProduce: z
    .object({
      enabled: z.boolean().default(false),
      reelsPerDay: z.number().int().min(1).max(8).default(1),
      startHourUtc: z.number().int().min(0).max(23).default(1), // 9AM PHT — drafts ready by the evening slot
      // Opt-in last mile: when the reel reaches 'approved' on an auto channel, upload it to YouTube
      // (needs the YOUTUBE_* env keys; silently stays manual without them). Default false — the
      // standing "publishing stays manual" rule holds unless the operator flips this.
      autoPublishYouTube: z.boolean().default(false),
    })
    .default({ enabled: false, reelsPerDay: 1, startHourUtc: 1, autoPublishYouTube: false }),
})
export type PostingRules = z.infer<typeof PostingRulesSchema>

// Shared by the auto-produce scheduler (worker) and the channel page (web) so "paused" means the
// same thing in both places: production pauses when this many unshipped reels pile up.
export const UNSHIPPED_REEL_STATUSES = [
  'drafting', 'story_review', 'storyboard', 'rendering', 'render_qa', 'spot_check', 'approved',
] as const
export function autoProduceBacklogCap(reelsPerDay: number): number {
  return reelsPerDay * 3
}
