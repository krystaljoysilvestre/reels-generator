import type { AudioMood } from '../types/channel.js'

// Music-bed prompt + length logic for the render-time generate_music step. The bed's arc + mood come
// from the operator's mood preset (see music-mood.ts); this composes the Eleven Music prompt around them.

export const MUSIC_MIN_MS = 10_000
export const MUSIC_MAX_MS = 300_000

// Hard constraints (mirrors the preset library): no vocals — they'd fight the narration — and a
// steady texture that sits under a speaking voice. Eleven Music's force_instrumental guarantees the
// no-vocals part; the prompt reinforces the texture.
export const MUSIC_CONSTRAINT =
  ' Instrumental only — no vocals, no singing, no choir, no lyrics, no spoken word.' +
  ' Consistent texture and steady volume throughout, no jarring hits or big drops.' +
  ' Sits quietly in the background under a speaking voice.'

// Compose the full Eleven Music prompt for a reel's bed. ONE coherent bed per reel — the mixer's
// volume envelope swells it toward the twist and SFX carry the climax hit, so the bed itself stays a
// steady, loopable texture (no separate intro/climax beds; a crossfade between two independent Eleven
// takes risked a key/tempo lurch at the worst moment).
//  • base        — the channel's sonic DNA (derived audioMood.prompt), or a tone/niche fallback.
//  • mood        — the operator's chosen mood: its rich phrase (moodPrompt) when set, else the story's
//                  mood tags. The moodPrompt is what actually diverges the bed between presets.
//  • instruction — an optional plain-language steer the operator typed when regenerating ("more tense",
//                  "add a slow heartbeat"). Eleven Music follows natural language, so we append it
//                  directly (no LLM rewrite needed) as the strongest, last directive before constraints.
export function buildMusicPrompt(params: {
  audioMood?: AudioMood | undefined
  toneIntensity: number
  nicheDescription: string
  moodTags: string[]
  moodPrompt?: string | undefined // rich phrase for the chosen mood preset — leads the character when set
  instruction?: string | undefined
}): string {
  const base =
    params.audioMood?.prompt?.trim() ||
    `a ${params.toneIntensity >= 6 ? 'dark, tense' : 'warm, gentle'} cinematic background bed for: ${params.nicheDescription.slice(0, 160)}`
  // The preset's rich phrase leads when chosen; otherwise fall back to the terse story-mood tilt.
  const mood = params.moodPrompt?.trim()
    ? ` ${params.moodPrompt.trim()}`
    : params.moodTags.length ? ` Lean ${params.moodTags.join(', ')} for this story.` : ''
  const steer = params.instruction?.trim() ? ` ${params.instruction.trim()}` : ''
  return base + mood + steer + MUSIC_CONSTRAINT
}

export function clampMusicLengthMs(lengthMs: number): number {
  return Math.min(MUSIC_MAX_MS, Math.max(MUSIC_MIN_MS, Math.round(lengthMs)))
}

// Pre-TTS length estimate for the storyboard, where no real timings exist yet. We OVER-generate
// (pad), never under: the mixer loops a too-short bed (audible seam) but cleanly truncates a too-long
// one. Estimate from the narration word count (~2.5 words/sec, the story generator's own pace) and
// floor it at the channel's target length, then pad ~15%.
const WORDS_PER_SEC = 2.5
const OVER_GEN_PAD = 1.15

export function estimateMusicLengthMs(params: {
  narration: string
  targetSeconds: number
}): number {
  const words = params.narration.trim().split(/\s+/).filter(Boolean).length
  const spokenSec = words / WORDS_PER_SEC
  const sec = Math.max(spokenSec, params.targetSeconds) * OVER_GEN_PAD
  return clampMusicLengthMs(sec * 1000)
}
