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

// A thing with a stable identity that RECURS across episodes — a creature, a mascot, a recurring host,
// a fictional organization, a deity, a place, an object. Deliberately shaped as BibleEntity already is
// ({id, kind, description}), so normalizeCanon becomes a straight map instead of a hand-written
// two-array mapper that was structurally unable to emit a CHARACTER at all — which is why a channel
// built on a recurring creature could never keep it looking the same twice.
// `description` is required: BibleEntity.description is the canonical depictable noun phrase spliced
// verbatim into image prompts, so a bare name is useless to the renderer.
export const PersistentEntitySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['character', 'location', 'object']),
  description: z.string().min(1),
})
export type PersistentEntity = z.infer<typeof PersistentEntitySchema>

export const WorldBibleSchema = z.object({
  region: z.string(),
  era: z.string(),
  // The unified list. canonLocations/canonObjects below are the v1 shape, kept readable so existing
  // channels resolve unchanged; normalizeCanon folds both together.
  persistentEntities: z.array(PersistentEntitySchema).default([]),
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
// pixel dimensions), length cap, caption-safe zone (platform UI overlay), and hook
// convention. This is the SINGLE source of truth: the channel.v1
// derivation reads the hints to tailor caption + length; image/video generation and
// the renderer read aspect/width/height; render QA reads maxSeconds.
export const TargetPlatformSchema = z.enum(['tiktok', 'youtube_shorts', 'facebook_reels', 'youtube_long', 'all'])
export type TargetPlatform = z.infer<typeof TargetPlatformSchema>

// A channel publishes to a SET of platforms (`channels.targetPlatforms`). These are the ones a
// creator can pick; 'all' is not among them — it is the legacy single-value bucket that predates the
// set, kept only so old rows and old drafts still resolve (see resolvePlatformPreset).
export const PUBLISH_PLATFORMS = ['tiktok', 'youtube_shorts', 'facebook_reels', 'youtube_long'] as const
export type PublishPlatform = (typeof PUBLISH_PLATFORMS)[number]

// Long-form is EXCLUSIVE: a 16:9 upload and a 9:16 reel are different shapes, and one render can only
// be one shape. Picking it clears the vertical set and vice versa — the same rule as language ("want
// the other one? make a separate channel").
export function isExclusivePlatform(p: TargetPlatform): boolean {
  return PLATFORM_PRESETS[p]?.aspect === '16:9'
}

// The platform SET as every route validates it: at least one, deduped, and never mixing an exclusive
// (16:9) platform with vertical ones. Rejecting the mix here — not just in the picker — keeps a hand-rolled
// API call from writing a row whose aspect the renderer would have to guess at.
export const TargetPlatformsSchema = z
  .array(z.enum(PUBLISH_PLATFORMS))
  .min(1, 'Pick at least one platform.')
  .transform((ps) => [...new Set(ps)])
  .refine((ps) => !(ps.length > 1 && ps.some(isExclusivePlatform)), {
    message: 'A widescreen upload and a vertical reel are different shapes — give long-form its own channel.',
  })

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
}

// The absolute ceiling any channel's targetSeconds can take — the largest platform cap (YouTube
// long-form). Route schemas validate against THIS; the per-platform clamp happens after.
export const MAX_TARGET_SECONDS = 1200

export const PLATFORM_PRESETS: Record<TargetPlatform, PlatformPreset> = {
  tiktok: {
    label: 'TikTok', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 180, sweetSpot: [21, 60],
    captionHint: 'big, bold, centered, word-by-word (pop/hype/impact) — high energy, reads on mute',
    lengthHint: '21–60s sweet spot (up to 180s allowed); keep it punchy',
    hookHint: 'instant pattern-interrupt in the first 1–2s with a bold on-screen text hook',
    safeZoneBottomPct: 18,
  },
  youtube_shorts: {
    label: 'YouTube Shorts', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 60, sweetSpot: [25, 55],
    captionHint: 'clean and legible, sitting a little higher to clear the bottom title/CTA UI',
    lengthHint: '60s hard cap; 25–55s ideal',
    hookHint: 'a clear curiosity/value promise in the first 3s, spoken and on-screen',
    safeZoneBottomPct: 14,
  },
  facebook_reels: {
    label: 'Facebook Reels', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 90, sweetSpot: [20, 60],
    captionHint: 'large, very high-contrast (older/mixed audience, almost always muted)',
    lengthHint: '90s cap; 20–60s ideal',
    hookHint: 'a relatable, story-led hook in the first 3s',
    safeZoneBottomPct: 20,
  },
  // Long-form YouTube (regular horizontal uploads, not Shorts). YouTube itself imposes no ceiling
  // here; this cap tracks what the PIPELINE can finish. The original 600s reason — keeping narration
  // inside ElevenLabs' single-request comfort zone — is obsolete: narrations past the chunk threshold
  // synthesize in seam-safe chunks, and the TTS timeout scales with the text. What binds now is render
  // wall-time (~18k frames per 10 min, see RENDER_STEP_TIMEOUT_MS) and two QUALITY ceilings that do NOT
  // move with this number: the music bed maxes at 5 min and loops, and the motion budget caps at 8 i2v
  // clips. Past ~20 min a reel is a slideshow over a 4×-looped bed — raise further only with a listen
  // test (see specs/long-form.md), not casually.
  youtube_long: {
    label: 'YouTube', aspect: '16:9', width: 1920, height: 1080, maxSeconds: 1200, sweetSpot: [300, 480],
    captionHint: 'restrained cinematic subtitles on a subtle bar — long-form viewers usually have sound ON, so captions support rather than perform',
    lengthHint: '5–20 minutes; give the story room to breathe and escalate in chapters. 5–8 is the sweet spot unless the story genuinely earns more',
    hookHint: 'a cold-open hook in the first 20–30s that promises the payoff, then a fresh pull every minute or two',
    safeZoneBottomPct: 8,
  },
  all: {
    label: 'All platforms', aspect: '9:16', width: 1080, height: 1920, maxSeconds: 60, sweetSpot: [20, 55],
    captionHint: 'safe, legible, centered — must read well on every platform',
    lengthHint: 'keep ≤60s so it fits Shorts everywhere; 20–55s ideal',
    hookHint: 'a strong, universal hook in the first 2–3s',
    safeZoneBottomPct: 18,
  },
}

// ── Resolving a SET of platforms into the one spec a render can have ──────────
// A reel is rendered once, so the pipeline needs a single frame, cap and safe zone no matter how many
// platforms the channel publishes to. The set is the creator's intent (stored verbatim); this collapses
// it to the spec that satisfies every member — narrowest length cap, widest safe zone, tightest sweet
// spot — with the hints naming the binding constraint so derivation and story-gen reason from it.
//
// Every consumer (derivation, story-gen, scene breakdown, image + video gen, render, render QA) reads
// THIS rather than indexing PLATFORM_PRESETS directly, so the multi-platform rule lives in one place.
export function resolvePlatformPreset(platforms: readonly string[] | null | undefined): PlatformPreset {
  const picked = (platforms ?? []).filter((p): p is PublishPlatform =>
    (PUBLISH_PLATFORMS as readonly string[]).includes(p),
  )
  // Nothing recognizable (an empty set, or a legacy row that only ever held 'all') → the
  // safe-everywhere bucket, exactly as before the set existed.
  if (picked.length === 0) return PLATFORM_PRESETS.all
  // Defensive: a 16:9 platform can't share a render with 9:16 ones. The picker prevents the mix and the
  // route schema rejects it, but if a row ever holds both, the exclusive shape wins — a widescreen
  // upload cropped to a Short is a broken video, whereas the reverse is merely a wasted opportunity.
  const exclusive = picked.find(isExclusivePlatform)
  if (exclusive) return PLATFORM_PRESETS[exclusive]
  if (picked.length === 1) return PLATFORM_PRESETS[picked[0]!]

  const presets = picked.map((p) => PLATFORM_PRESETS[p])
  const maxSeconds = Math.min(...presets.map((p) => p.maxSeconds))
  // Intersect the recommended ranges. If the intersection inverts (no length suits everyone), fall back
  // to the hard cap so the sweet spot never asks for something longer than the export allows.
  const low = Math.max(...presets.map((p) => p.sweetSpot[0]))
  const high = Math.min(...presets.map((p) => p.sweetSpot[1]))
  const sweetSpot: [number, number] = low <= high ? [low, high] : [Math.min(low, maxSeconds), maxSeconds]
  // The binding platform for each constraint — named in the hints so the LLM knows WHY the ceiling is
  // where it is instead of being handed a bare number.
  const shortest = presets.reduce((a, b) => (b.maxSeconds < a.maxSeconds ? b : a))
  const tallestUi = presets.reduce((a, b) => (b.safeZoneBottomPct > a.safeZoneBottomPct ? b : a))
  const names = presets.map((p) => p.label).join(' + ')

  return {
    label: names,
    aspect: '9:16',
    width: 1080,
    height: 1920,
    maxSeconds,
    sweetSpot,
    captionHint: `must read well on all of ${names} — legible and high-contrast, sitting clear of the tallest bottom UI (${tallestUi.label})`,
    lengthHint: `${sweetSpot[0]}–${sweetSpot[1]}s; ${maxSeconds}s hard cap, set by ${shortest.label}`,
    hookHint: `a strong hook in the first 2–3s that works on all of ${names}`,
    safeZoneBottomPct: Math.max(...presets.map((p) => p.safeZoneBottomPct)),
  }
}

// Convenience for the many consumers that hold a channel row: resolves the row's platform set, and
// still understands rows written before the set existed (legacy single `targetPlatform`).
export function channelPlatformPreset(channel: {
  targetPlatforms?: readonly string[] | null
  targetPlatform?: string | null
}): PlatformPreset {
  if (channel.targetPlatforms?.length) return resolvePlatformPreset(channel.targetPlatforms)
  const legacy = channel.targetPlatform
  if (legacy && legacy in PLATFORM_PRESETS) return PLATFORM_PRESETS[legacy as TargetPlatform]
  return PLATFORM_PRESETS.all
}

// Per-channel burned-in caption style. The operator picks an expressive preset
// (AI-suggested per niche); the resolved params are stored and read by the renderer,
// which animates them word-by-word. These are built to compete with the captions you
// see on TikTok / Reels / Shorts — not plain subtitles.
export const CaptionPresetSchema = z.enum([
  'sable', 'pulse', 'marquee', 'lyric', 'signal', 'halo', 'slate', 'kick', 'seance', 'notebook',
  'still', 'chrome', 'volt', 'static', 'plate', 'field', 'voyage', 'paws', 'candid', 'dance',
])
export type CaptionPreset = z.infer<typeof CaptionPresetSchema>

// Existing channels persist a fully RESOLVED style in JSON, so a legacy row names its closest
// replacement here and is re-resolved through it on read — see `upgradeLegacyCaptionStyle`.
const LEGACY_CAPTION_PRESET_MAP: Record<string, CaptionPreset> = {
  clean: 'candid', pop: 'pulse', hype: 'marquee', karaoke: 'lyric', neon: 'volt', whisper: 'seance',
  impact: 'dance', elegant: 'halo', comic: 'kick', terminal: 'signal', cinematic: 'sable', breaking: 'slate',
  marker: 'notebook', script: 'still', retro: 'chrome', glitch: 'static',
}

// The four creator-tweakable knobs of each RETIRED preset, frozen at the commit that replaced them
// (352f3a1). Not decoration and not history: this is the only way to tell a creator's deliberate override
// apart from the old preset's own default. Crossroads stores `highlightColor: '#0057b8'` under legacy
// `marker`, whose default was '#ffe11a' — so the blue is the creator's brand accent and must survive the
// upgrade, while Emberlight stores `elegant`'s defaults unchanged and must adopt its replacement whole.
// Diffing against the NEW preset instead would preserve every old default as if it were a choice, which
// is exactly the bug: the channel would keep the look it is supposed to be leaving.
const LEGACY_CAPTION_DEFAULTS: Record<string, { fontSizePx: number; color: string; highlightColor: string; position: CaptionStyle['position'] }> = {
  clean: { fontSizePx: 50, color: '#ffffff', highlightColor: '#7fd1ff', position: 'bottom' },
  pop: { fontSizePx: 62, color: '#ffffff', highlightColor: '#ffd400', position: 'bottom' },
  hype: { fontSizePx: 66, color: '#ffffff', highlightColor: '#22e06b', position: 'center' },
  karaoke: { fontSizePx: 56, color: '#ffffff', highlightColor: '#ff4d8d', position: 'bottom' },
  neon: { fontSizePx: 58, color: '#eafffb', highlightColor: '#19f0c3', position: 'center' },
  whisper: { fontSizePx: 46, color: '#e9e7ea', highlightColor: '#c01616', position: 'bottom' },
  impact: { fontSizePx: 74, color: '#ffffff', highlightColor: '#ff2e2e', position: 'center' },
  elegant: { fontSizePx: 40, color: '#ffffff', highlightColor: '#d9b46a', position: 'bottom' },
  comic: { fontSizePx: 60, color: '#ffffff', highlightColor: '#ff5fa2', position: 'bottom' },
  terminal: { fontSizePx: 42, color: '#35ff9e', highlightColor: '#35ff9e', position: 'bottom' },
  cinematic: { fontSizePx: 44, color: '#f2f2f2', highlightColor: '#cfd6e6', position: 'bottom' },
  breaking: { fontSizePx: 48, color: '#ffffff', highlightColor: '#e10600', position: 'bottom' },
  marker: { fontSizePx: 56, color: '#ffffff', highlightColor: '#ffe11a', position: 'bottom' },
  script: { fontSizePx: 52, color: '#fff7ef', highlightColor: '#ffd9a0', position: 'center' },
  retro: { fontSizePx: 56, color: '#ffffff', highlightColor: '#f471b5', position: 'center' },
  glitch: { fontSizePx: 60, color: '#ffffff', highlightColor: '#00e5ff', position: 'center' },
}

// Re-resolve a stored style that still names a retired preset (publish-bar audit, 2026-08-10).
//
// THE BUG THIS CLOSES. `352f3a1` replaced every caption preset because the founder's own verdict on three
// finished reels was "the burned caption styles look so old" — one of three reasons no reel had ever been
// published. But the remap only ever moved the preset ID: the render step parses the STORED RESOLVED
// STYLE verbatim, so all three channels kept their old fontFamily, fontSizePx, animation, stroke and
// letterSpacing. The new presets reached only channels created after the commit — i.e. none of the ones
// that prompted the change.
//
// WHY HERE AND NOT IN A MIGRATION. A legacy preset id in a stored row IS the marker for "predates the new
// presets", so upgrading on read fixes every channel in every environment at once, needs no per-preset
// jsonb SQL over sixteen retired presets, and cannot destructively mis-write a row — the stored value
// stays intact and readable. The upgrade stops applying the moment settings are saved again, because that
// writes a current preset id.
//
// Deliberately NOT a general "re-resolve from preset" on every read: a current preset's stored style is
// left exactly as it is. Resolution happens once, at the point the creator chooses, and this function
// only catches rows that were resolved against a table that no longer exists.
function upgradeLegacyCaptionStyle(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  const stored = value as Record<string, unknown>
  const legacy = typeof stored['preset'] === 'string' ? stored['preset'] : null
  if (!legacy) return value
  const replacement = LEGACY_CAPTION_PRESET_MAP[legacy]
  const old = LEGACY_CAPTION_DEFAULTS[legacy]
  if (!replacement || !old) return value // already a current preset, or unknown — leave it alone

  // Only a value that DIFFERS from the retired preset's default was the creator's own choice.
  const tweaks: CaptionTweaks = {}
  if (typeof stored['highlightColor'] === 'string' && stored['highlightColor'] !== old.highlightColor) {
    tweaks.highlightColor = stored['highlightColor']
  }
  if (typeof stored['color'] === 'string' && stored['color'] !== old.color) {
    tweaks.color = stored['color']
  }
  if (typeof stored['position'] === 'string' && stored['position'] !== old.position) {
    tweaks.position = stored['position'] as CaptionStyle['position']
  }
  // Size carries over as a RATIO, never as a pixel count: the replacement preset has its own base size,
  // and a creator who scaled type up by a third meant the third, not the pixels.
  if (typeof stored['fontSizePx'] === 'number' && stored['fontSizePx'] !== old.fontSizePx) {
    tweaks.fontScale = stored['fontSizePx'] / old.fontSizePx
  }

  // `enabled` is a first-class creator switch rather than part of any preset's look — carry it verbatim.
  const enabled = typeof stored['enabled'] === 'boolean' ? { enabled: stored['enabled'] } : {}
  return { ...resolveCaptionStyle(replacement, tweaks), ...enabled }
}

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
//   flicker     — the line fades up slowly, then gutters like a failing bulb (block)
//   none        — static
export const CaptionAnimationSchema = z.enum([
  'fade', 'pop', 'bounce', 'karaoke', 'typewriter', 'highlight_box', 'punch',
  'marker', 'glitch', 'comic', 'rise', 'flicker', 'none',
])
export type CaptionAnimation = z.infer<typeof CaptionAnimationSchema>

export const CaptionShadowSchema = z.enum(['none', 'soft', 'hard', 'glow'])
export type CaptionShadow = z.infer<typeof CaptionShadowSchema>

const CaptionStyleObjectSchema = z.object({
  // First-class captions-off toggle: false burns NO subtitles (the renderer skips the overlay). Some
  // formats/channels want clean visuals + narration only — previously this required emptying
  // timings.subtitles by hand (see the News Today PH production). Optional so absent/undefined = ON (every
  // existing channel + preset keeps captions); only an explicit false disables. In the captionStyle jsonb,
  // so no schema migration. See ROADMAP finding.
  enabled: z.boolean().optional(),
  preset: z.preprocess(
    (value) => typeof value === 'string' ? (LEGACY_CAPTION_PRESET_MAP[value] ?? value) : value,
    CaptionPresetSchema,
  ).default('candid'),
  mode: z.enum(['block', 'word']).default('word'), // word = per-word treatment/animation
  animation: CaptionAnimationSchema.default('fade'),
  fontFamily: z.string().default('Inter, Arial, sans-serif'),
  fontWeight: z.number().int().min(300).max(900).default(800),
  fontSizePx: z.number().int().min(24).max(150).default(58), // at 1080×1920
  uppercase: z.boolean().default(false),
  italic: z.boolean().default(false),
  letterSpacingEm: z.number().min(-0.05).max(0.5).default(0),
  // Per-preset leading. A single hardcoded 1.25 was flattening the set: the design runs from
  // 1.02 (Anton lower-third, caps packed tight) to 1.7 (Halo's airy wide-tracked light caps),
  // and that spread is most of what separates one preset's voice from another's.
  lineHeight: z.number().min(0.9).max(2).default(1.2),
  color: z.string().default('#ffffff'),          // base / not-yet-spoken words
  activeColor: z.string().default('#ffffff'),     // spoken word text (e.g. dark on a box)
  highlightColor: z.string().default('#ffe34d'),  // accent: box fill / karaoke fill / glow
  // ── How the ONE accent word is treated, beyond its colour ──────────────────────────────
  // Several presets do more than recolour the word the line lands on, and treating colour as
  // the whole of "accent" flattened them into each other.
  accentItalic: z.boolean().optional(),  // sable italicises its accent word — an editorial aside
  accentScale: z.number().min(1).max(2).optional(), // kick's punchline is set larger than the line
  // Block-mode presets normally carry no per-word treatment at all: their accent colour goes to a
  // flourish (halo's middot, still's closing period) rather than to a word. seance is the exception
  // — a cold serif with one word in brick — so it opts in and its line is laid out per word.
  accentWord: z.boolean().optional(),
  stroke: z
    .object({
      color: z.string().default('#000000'),
      widthPx: z.number().min(0).max(24).default(8), // outline at 1080×1920
    })
    .default({}),
  shadow: CaptionShadowSchema.default('hard'),
  // How dark the glyph shadow sits. The design's value is 0.45 and that is the default; the
  // render-time legibility pass raises it per reel on bright footage. A shadow is LOCAL — it
  // darkens a few pixels around each letter and is invisible as a shape — so it is always tried
  // before the scrim, which darkens a region of the picture. Not a stroke: the design rejects
  // "12px black outlines choking every glyph", and this is the soft device it uses instead.
  shadowAlpha: z.number().min(0.2).max(0.9).optional(),
  position: z.enum(['bottom', 'center', 'top']).default('bottom'),
  // How far a BOTTOM caption sits above the frame's bottom edge, as % of frame height. Most
  // presets leave this unset and take the platform safe zone. A preset sets it when its
  // placement is a design choice rather than a UI clearance — pulse rides at 34%, well above
  // the clutter, which is a different look from a subtitle hugging the bottom. The safe zone
  // still wins if it is larger, so this can never push a caption INTO the platform UI.
  bottomInsetPct: z.number().min(0).max(60).optional(),
  rotationDeg: z.number().min(-8).max(8).default(0), // slight tilt for energy
  // Optional panel behind the line. 'bar' = translucent plate with an accent rule down its
  // left edge (the mono chyron), 'block' = full-bleed lower third under a hairline accent rule
  // (the news slate), 'scrim' = a frame-wide gradient wash rising from the BOTTOM EDGE of the
  // frame. Absent = none.
  backplate: z.enum(['none', 'bar', 'block', 'scrim']).optional(),
  // How far up the frame the scrim wash reaches, as a % of frame height. Only read when
  // backplate === 'scrim'. The wash is always pinned to the bottom edge — see SubtitleOverlay.
  scrimPct: z.number().min(20).max(70).optional(),
  // How dark the wash gets at the frame edge. The design's value is 0.62 and that is the default;
  // the render-time legibility pass raises it per reel when the footage is bright enough to swallow
  // the type (see packages/render/src/remotion/caption-legibility.ts). Deepening the ground is how
  // the design buys contrast — the alternative, repainting the accent, deletes the palette.
  scrimAlpha: z.number().min(0.3).max(0.95).optional(),
  // Optional gradient text fill (chrome). `mid`/`midStop` add the third stop the design uses
  // to turn the ramp from cool to warm through a held middle, rather than a flat two-stop blend.
  gradient: z.object({
    from: z.string(),
    to: z.string(),
    mid: z.string().optional(),
    midStop: z.number().min(0).max(100).optional(),
  }).optional(),
})

// A stored style naming a RETIRED preset is re-resolved through its replacement before validation, so
// every reader — render step, settings screen, preview — sees the current look rather than a snapshot of
// a preset table that no longer exists. The field-level `preset` preprocess above still stands on its own
// for a bare preset string.
export const CaptionStyleSchema = z.preprocess(upgradeLegacyCaptionStyle, CaptionStyleObjectSchema)
export type CaptionStyle = z.infer<typeof CaptionStyleObjectSchema>

// Concrete params per preset. `highlightColor` may be overridden (e.g. AI-derived per niche).
// Font stacks end in a generic family so the headless render host always has a fallback.
//
// TRANSCRIBED FROM THE DESIGN, NOT ESTIMATED. Every number below was measured off the caption
// system reference ("Kendrix Caption Styles", the twenty-card gallery) by reading each card's
// computed styles in a browser and normalising to a 1080-wide frame: the reference cards render
// at 374px wide, so `fontSizePx = round(refPx × 1080/374)`. The first transcription eyeballed
// these and landed ~1.4× small across the board (sable 52 where the design says 95, kick 68
// where it says 81), which is why the shipped captions read as timid, generic subtitles rather
// than as the twenty distinct voices that were drawn.
//
// The reference's own four rules, for anyone tuning these later:
//   1. contrast comes from the scrim wash, never from a heavy stroke  (every stroke here is 0)
//   2. the typeface carries the niche                                 (8 families, 20 voices)
//   3. motion settles — words rise and rest, nothing shakes or spins
//   4. one muted accent per preset, all sharing one chroma
export const CAPTION_PRESETS: Record<CaptionPreset, CaptionStyle> = {
  // Storytelling · video essays · documentary — calm editorial serif, words rise once and hold
  sable: { preset: 'sable', mode: 'word', animation: 'rise', fontFamily: '"Instrument Serif", Georgia, serif', fontWeight: 400, fontSizePx: 95, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.14, color: '#F5F3EE', activeColor: '#F5F3EE', highlightColor: '#E8B04B', accentItalic: true, stroke: { color: '#000', widthPx: 0 }, shadow: 'none', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 52 },
  // General · lifestyle · vlog — bold word pop, the keyword breathes in a single accent
  pulse: { preset: 'pulse', mode: 'word', animation: 'pop', fontFamily: 'Archivo, Arial, sans-serif', fontWeight: 800, fontSizePx: 84, uppercase: true, italic: false, letterSpacingEm: -0.015, lineHeight: 1.06, color: '#fff', activeColor: '#fff', highlightColor: '#C4E070', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', bottomInsetPct: 34, rotationDeg: 0, backplate: 'scrim', scrimPct: 46 },
  // Business · motivation — the highlight pill done right: one warm chip, deep ink text
  marquee: { preset: 'marquee', mode: 'word', animation: 'highlight_box', fontFamily: 'Archivo, Arial, sans-serif', fontWeight: 900, fontSizePx: 87, uppercase: true, italic: false, letterSpacingEm: 0, lineHeight: 1.08, color: '#fff', activeColor: '#151006', highlightColor: '#F4C24E', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'center', rotationDeg: 0 },
  // Music · lyric · poetry — upcoming words dim, the sung word fills and sweeps
  lyric: { preset: 'lyric', mode: 'word', animation: 'karaoke', fontFamily: '"Hanken Grotesk", Arial, sans-serif', fontWeight: 700, fontSizePx: 78, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.22, color: '#fff', activeColor: '#fff', highlightColor: '#F0806E', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'center', rotationDeg: 0 },
  // Tech · AI · crypto — a mono chyron on a thin left-ruled plate, typewriter reveal
  signal: { preset: 'signal', mode: 'block', animation: 'typewriter', fontFamily: '"JetBrains Mono", monospace', fontWeight: 500, fontSizePx: 55, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.4, color: '#EAF0F5', activeColor: '#EAF0F5', highlightColor: '#7FB2E8', stroke: { color: '#000', widthPx: 0 }, shadow: 'none', position: 'bottom', rotationDeg: 0, backplate: 'bar' },
  // Beauty · fashion · luxury · ASMR — airy wide-tracked light caps that fade
  halo: { preset: 'halo', mode: 'block', animation: 'fade', fontFamily: '"Space Grotesk", Arial, sans-serif', fontWeight: 300, fontSizePx: 49, uppercase: true, italic: false, letterSpacingEm: 0.34, lineHeight: 1.7, color: '#F7F3F0', activeColor: '#F7F3F0', highlightColor: '#F0A79B', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 40 },
  // News · sports · updates — a modern lower third under a hairline accent rule
  slate: { preset: 'slate', mode: 'block', animation: 'fade', fontFamily: 'Anton, Impact, sans-serif', fontWeight: 400, fontSizePx: 66, uppercase: true, italic: false, letterSpacingEm: 0.01, lineHeight: 1.02, color: '#fff', activeColor: '#fff', highlightColor: '#E8564B', stroke: { color: '#000', widthPx: 0 }, shadow: 'none', position: 'bottom', rotationDeg: 0, backplate: 'block' },
  // Comedy · memes · reactions — playful display face, the punchline settles
  kick: { preset: 'kick', mode: 'word', animation: 'bounce', fontFamily: '"Bricolage Grotesque", Arial, sans-serif', fontWeight: 800, fontSizePx: 81, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.05, color: '#fff', activeColor: '#fff', highlightColor: '#C4E070', accentScale: 1.43, stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 44 },
  // Horror · mystery · true crime — a cold dramatic serif that reveals slowly and flickers, barely.
  // NOT a typewriter: that reveal (with its blinking caret) belongs to signal, and giving it to
  // seance as well made the two read as the same idea in different fonts.
  seance: { preset: 'seance', mode: 'block', animation: 'flicker', fontFamily: '"DM Serif Display", Georgia, serif', fontWeight: 400, fontSizePx: 89, uppercase: false, italic: false, letterSpacingEm: 0.01, lineHeight: 1.2, color: '#E6E7EA', activeColor: '#E6E7EA', highlightColor: '#C05149', accentWord: true, stroke: { color: '#000', widthPx: 0 }, shadow: 'none', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 50 },
  // Study · tips · how-to — clean sans with a highlighter swipe under the takeaway
  notebook: { preset: 'notebook', mode: 'word', animation: 'marker', fontFamily: '"Hanken Grotesk", Arial, sans-serif', fontWeight: 700, fontSizePx: 72, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.4, color: '#fff', activeColor: '#141110', highlightColor: '#F4D24E', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 44 },
  // Wellness · faith · quotes — calm centred italic serif that fades in
  still: { preset: 'still', mode: 'block', animation: 'fade', fontFamily: '"Instrument Serif", Georgia, serif', fontWeight: 400, fontSizePx: 87, uppercase: false, italic: true, letterSpacingEm: 0.01, lineHeight: 1.5, color: '#F3EFEA', activeColor: '#F3EFEA', highlightColor: '#A9C4A0', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'center', rotationDeg: 0 },
  // Retro · 80s · synthwave — a cool-to-warm gradient fill, chrome not neon
  chrome: { preset: 'chrome', mode: 'block', animation: 'fade', fontFamily: '"Space Grotesk", Arial, sans-serif', fontWeight: 700, fontSizePx: 92, uppercase: true, italic: false, letterSpacingEm: 0.03, lineHeight: 1.08, color: '#fff', activeColor: '#fff', highlightColor: '#7FB2E8', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'center', rotationDeg: 0, gradient: { from: '#bfe4ff', mid: '#7FB2E8', midStop: 45, to: '#F0806E' } },
  // Gaming · nightlife · hype — bold caps pop, the payoff word glows electric
  volt: { preset: 'volt', mode: 'word', animation: 'pop', fontFamily: 'Archivo, Arial, sans-serif', fontWeight: 900, fontSizePx: 84, uppercase: true, italic: false, letterSpacingEm: 0, lineHeight: 1.06, color: '#EAFBFF', activeColor: '#EAFBFF', highlightColor: '#4CC5FF', stroke: { color: '#000', widthPx: 0 }, shadow: 'glow', position: 'center', rotationDeg: 0 },
  // Edgy · alt · streetwear — hard caps with a tight RGB split on the accent
  static: { preset: 'static', mode: 'word', animation: 'glitch', fontFamily: 'Archivo, Arial, sans-serif', fontWeight: 800, fontSizePx: 84, uppercase: true, italic: false, letterSpacingEm: 0.01, lineHeight: 1.08, color: '#fff', activeColor: '#fff', highlightColor: '#7FB2E8', stroke: { color: '#000', widthPx: 0 }, shadow: 'none', position: 'center', rotationDeg: 0 },
  // Food · recipe · cooking — friendly sans, the key verb in a warm accent
  plate: { preset: 'plate', mode: 'word', animation: 'rise', fontFamily: '"Hanken Grotesk", Arial, sans-serif', fontWeight: 800, fontSizePx: 78, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.2, color: '#fff', activeColor: '#fff', highlightColor: '#E8B04B', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 46 },
  // Sports · fitness · training — italic caps with drive
  field: { preset: 'field', mode: 'word', animation: 'pop', fontFamily: 'Archivo, Arial, sans-serif', fontWeight: 900, fontSizePx: 87, uppercase: true, italic: true, letterSpacingEm: 0, lineHeight: 1.02, color: '#fff', activeColor: '#fff', highlightColor: '#B8E04B', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 44 },
  // Travel · places · adventure — a clean geometric sans over a calm wash
  voyage: { preset: 'voyage', mode: 'word', animation: 'rise', fontFamily: '"Space Grotesk", Arial, sans-serif', fontWeight: 600, fontSizePx: 75, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.2, color: '#F4F7F6', activeColor: '#F4F7F6', highlightColor: '#5FB6A6', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 46 },
  // Pets · animals · wholesome — rounded, warm, unhurried
  paws: { preset: 'paws', mode: 'word', animation: 'pop', fontFamily: '"Bricolage Grotesque", Arial, sans-serif', fontWeight: 700, fontSizePx: 81, uppercase: false, italic: false, letterSpacingEm: 0, lineHeight: 1.12, color: '#fff', activeColor: '#fff', highlightColor: '#F2A177', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 44 },
  // Everyday · storytime · POV — the neutral house voice, legible on anything
  candid: { preset: 'candid', mode: 'word', animation: 'rise', fontFamily: '"Hanken Grotesk", Arial, sans-serif', fontWeight: 800, fontSizePx: 78, uppercase: false, italic: false, letterSpacingEm: -0.01, lineHeight: 1.22, color: '#fff', activeColor: '#fff', highlightColor: '#7FB2E8', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'bottom', rotationDeg: 0, backplate: 'scrim', scrimPct: 46 },
  // Dance · music · trends — heavy caps on the beat
  dance: { preset: 'dance', mode: 'word', animation: 'pop', fontFamily: 'Archivo, Arial, sans-serif', fontWeight: 900, fontSizePx: 89, uppercase: true, italic: false, letterSpacingEm: -0.01, lineHeight: 1.04, color: '#fff', activeColor: '#fff', highlightColor: '#F0806E', stroke: { color: '#000', widthPx: 0 }, shadow: 'soft', position: 'center', rotationDeg: 0 },
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
  const base = CAPTION_PRESETS[preset] ?? CAPTION_PRESETS.candid
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

// When a finished reel actually goes out. 'immediate' = the moment it's approved (the original
// behavior, and the default for every existing channel). 'slots' = hold it for the channel's next
// free posting slot, so a channel publishes on a rhythm instead of whenever a render happens to land.
//
// Hours are UTC (like the rest of postingRules); the UI renders them in the operator's local time.
// slotsUtc empty → fall back to the channel's single scheduleUtcHour slot.
// daysUtc: 0 = Sunday … 6 = Saturday (UTC weekday); empty → every day.
export const PublishScheduleSchema = z.object({
  mode: z.enum(['immediate', 'slots']).default('immediate'),
  slotsUtc: z.array(z.number().int().min(0).max(23)).max(8).default([]),
  daysUtc: z.array(z.number().int().min(0).max(6)).max(7).default([0, 1, 2, 3, 4, 5, 6]),
})
export type PublishSchedule = z.infer<typeof PublishScheduleSchema>

export const PostingRulesSchema = z.object({
  platforms: z.array(z.enum(['fb', 'ig', 'yt', 'tiktok'])).default(['fb']),
  scheduleUtcHour: z.number().int().min(0).max(23).default(13), // 9PM PHT = 13:00 UTC
  qualityThreshold: z.number().min(0).max(10).default(0),       // 0 = no auto-filter in Phase 1
  // WHEN a finished reel goes out (see PublishScheduleSchema). Separate axis from autoProduce, which
  // governs when reels are CREATED. Defaults to 'immediate' so channels created before this existed
  // behave exactly as they did.
  publish: PublishScheduleSchema.default({ mode: 'immediate', slotsUtc: [], daysUtc: [0, 1, 2, 3, 4, 5, 6] }),
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

// The channel's posting slots, resolved. A channel that never set explicit slots still has one —
// scheduleUtcHour — so "post on a schedule" is meaningful the moment it's switched on.
export function resolvePublishSlots(rules: PostingRules): number[] {
  const slots = rules.publish.slotsUtc.length ? rules.publish.slotsUtc : [rules.scheduleUtcHour]
  return [...new Set(slots)].sort((a, b) => a - b)
}

// The UTC weekdays the channel posts on. Empty means "no day was picked", which we read as every day
// rather than never — a schedule that can never fire would silently strand finished reels.
export function resolvePublishDays(rules: PostingRules): number[] {
  const days = rules.publish.daysUtc.length ? rules.publish.daysUtc : [0, 1, 2, 3, 4, 5, 6]
  return [...new Set(days)].sort((a, b) => a - b)
}
