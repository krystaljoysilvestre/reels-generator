import type { AudioMood } from '../types/channel.js'

// Music-bed prompt + length logic for the render-time generate_music step. The bed's arc + mood come
// from the operator's mood preset (see music-mood.ts); this composes the Eleven Music prompt around them.

export const MUSIC_MIN_MS = 10_000
export const MUSIC_MAX_MS = 300_000

// Hard constraints: no vocals (they'd fight the narration) and it must stay UNDER a speaking voice.
// Eleven Music's force_instrumental guarantees the no-vocals part. Crucially, we NO LONGER ask for a
// "consistent/steady texture" — that instruction produced a single unchanging wash for the whole reel
// (the "continuous flat sound" complaint). The bed must EVOLVE; the arc clause below shapes how.
export const MUSIC_CONSTRAINT =
  ' Instrumental only — no vocals, no singing, no choir, no lyrics, no spoken word.' +
  ' It plays under a speaking voice, so keep the midrange clear and never bury the narrator —' +
  ' but it must NOT sit still: let the texture and intensity EVOLVE across the piece, with elements' +
  ' entering and receding, so it breathes and develops rather than looping one flat tone.'

// The bed's arc — WHERE and HOW it develops. Keyed to the sound designer's chosen music type (its
// intended movement) and the story's emotional peak position, so a low_drone still drifts and mounts
// instead of sitting dead, while a riser_sting genuinely builds. Genre-neutral ("emotional peak"), so
// warmth builds as naturally as dread.
// Every arc opens with IMMEDIATE presence — the bed's CHARACTER must be felt within the first second (owner
// direction 2026-07-06: a sparse/near-silent intro reads as "no music" and loses the viewer before the story
// starts). Phase B (2026-07-24): presence is universal; its FLAVOR is the register's. The old mistake was
// "immediate presence = immediate tension"; the rule is "immediate presence = immediate CHARACTER" — the
// opening establishes the mood (calm, warm, driving, tense) from second one, not fades up from nothing. The
// build is in texture and development, not in ramping from silence.
//
// `loops` = the video outruns the provider's max generation (300s) and the mixer will aloop this bed
// to cover the tail. That's a hard execution constraint, not taste: a bed with a terminal peak resets
// audibly at the seam, so a looping bed keeps its evolution CYCLICAL (resolving back toward its own
// opening) and leaves the video-level build to the mixer's volume envelope, which still swells toward
// the actual climax.
function musicArc(musicType: string | undefined, peakFrac: number, loops: boolean): string {
  const openPresent = ' It must be clearly present and establish its character from the VERY FIRST SECOND — no slow fade-in from silence, no sparse empty intro.'
  if (loops) {
    return `${openPresent} This piece will LOOP under a longer video, so keep its evolution cyclical: the texture breathes, shifts and returns toward where it opened, with no terminal climax and no fade-out — the end must flow back into the beginning without a noticeable seam.`
  }
  const pct = Math.round(Math.min(0.95, Math.max(0.3, peakFrac)) * 100)
  switch (musicType) {
    case 'riser_sting':
      return `${openPresent} Shape it as a continuous build: energized from the open, layering in and intensifying, growing toward an emotional peak around ${pct}% of the way through, then pull back.`
    case 'drone_swell':
      return `${openPresent} Let it move in swells — rising and receding like breath, always audible, cresting toward an emotional peak around ${pct}% of the way through.`
    case 'low_drone':
      return `${openPresent} Keep it low and sustained but continuously evolving — the texture shifting and developing toward around ${pct}% of the way through; never a single unchanging tone.`
    default:
      return `${openPresent} Let it develop and build toward an emotional peak around ${pct}% of the way through, then settle.`
  }
}

// The reel holds its closing image for a beat after the last spoken word (compute-timings §4.65), and the
// mixer resolves the bed's LEVEL across it. Ask the composition to resolve MUSICALLY there too, so the
// ending sounds finished rather than faded: level shaping alone can smooth a cut, but only the piece
// itself can land a final chord. Best-effort — the mixer's ramp guarantees a graceful end either way.
const RESOLVE_CLAUSE =
  ' In its final seconds the piece must RESOLVE — arrive somewhere and come to rest (a last sustained chord, a settled note), never stop mid-phrase as though cut off.'

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
  musicType?: string | undefined  // designer's chosen movement (low_drone | drone_swell | riser_sting)
  peakFrac?: number | undefined   // where the story's emotional peak sits (0..1 of the reel)
  loops?: boolean | undefined     // the bed is shorter than the video and will be aloop'd — ask for a seamless cycle
}): string {
  const base =
    params.audioMood?.prompt?.trim() ||
    `a ${params.toneIntensity >= 6 ? 'dark, tense' : 'warm, gentle'} cinematic background bed for: ${params.nicheDescription.slice(0, 160)}`
  // The preset's rich phrase leads when chosen; otherwise fall back to the terse story-mood tilt. The bed's
  // character comes from the operator's mood preset (and the story's mood) — NOT a hardcoded per-genre
  // texture, so nothing forces e.g. a heartbeat on every horror reel.
  const mood = params.moodPrompt?.trim()
    ? ` ${params.moodPrompt.trim()}`
    : params.moodTags.length ? ` Lean ${params.moodTags.join(', ')} for this story.` : ''
  const loops = params.loops ?? false
  const arc = musicArc(params.musicType, params.peakFrac ?? 0.8, loops)
  // A looping bed must NOT resolve (it has to flow back into its own opening at the seam).
  const resolve = loops ? '' : RESOLVE_CLAUSE
  const steer = params.instruction?.trim() ? ` ${params.instruction.trim()}` : ''
  // Operator steer stays the last, strongest directive before the hard constraints.
  return base + mood + arc + resolve + steer + MUSIC_CONSTRAINT
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
