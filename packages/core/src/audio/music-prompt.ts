import type { AudioMood } from '../types/channel.js'

// Shared music-bed prompt + length logic, used by BOTH the storyboard's on-demand preview
// (apps/web /api/pipeline/preview-music) and the render-time generate_music step, so a bed
// vetted at the storyboard is built the same way as one composed during render.

export const MUSIC_MIN_MS = 10_000
export const MUSIC_MAX_MS = 300_000

// Hard constraints (mirrors the preset library): no vocals — they'd fight the narration — and a
// steady texture that sits under a speaking voice. Eleven Music's force_instrumental guarantees the
// no-vocals part; the prompt reinforces the texture.
export const MUSIC_CONSTRAINT =
  ' Instrumental only — no vocals, no singing, no choir, no lyrics, no spoken word.' +
  ' Consistent texture and steady volume throughout, no jarring hits or big drops.' +
  ' Sits quietly in the background under a speaking voice.'

// Compose the full Eleven Music prompt for a reel's bed.
//  • base        — the channel's sonic DNA (derived audioMood.prompt), or a tone/niche fallback.
//  • tilt        — this story's mood tags, so the bed fits THIS story within the channel's family.
//  • instruction — an optional plain-language steer the operator typed when regenerating ("more tense",
//                  "add a slow heartbeat"). Eleven Music follows natural language, so we append it
//                  directly (no LLM rewrite needed) as the strongest, last directive before constraints.
export function buildMusicPrompt(params: {
  audioMood?: AudioMood | undefined
  toneIntensity: number
  nicheDescription: string
  moodTags: string[]
  instruction?: string | undefined
  // Two-section scoring: 'intro' = the restrained build; 'climax' = the intense peak. Same sonic family,
  // crossfaded at the twist. Omit for a single bed.
  section?: 'intro' | 'climax' | undefined
}): string {
  const base =
    params.audioMood?.prompt?.trim() ||
    `a ${params.toneIntensity >= 6 ? 'dark, tense' : 'warm, gentle'} cinematic background bed for: ${params.nicheDescription.slice(0, 160)}`
  const tilt = params.moodTags.length ? ` Lean ${params.moodTags.join(', ')} for this story.` : ''
  const section =
    params.section === 'intro'
      ? ' Restrained and slow-building — sparse, quiet, holding tension back.'
      : params.section === 'climax'
        ? ' The climax — fuller, more intense and dread-soaked, the emotional peak.'
        : ''
  const steer = params.instruction?.trim() ? ` ${params.instruction.trim()}` : ''
  return base + tilt + section + steer + MUSIC_CONSTRAINT
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
