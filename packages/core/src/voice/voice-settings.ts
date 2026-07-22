// Per-reel narration delivery. ElevenLabs `voice_settings` shape the SAME chosen voice's performance
// — the difference between a flat read and a slow, breathy, dread-soaked one. We DERIVE these (no
// operator UI) from the channel's tone baseline + THIS reel's story mood, so a tense story is
// delivered differently from a wistful one while staying in the channel's character.
import { z } from 'zod'
import type { ToneConfig } from '../types/channel.js'

export interface VoiceSettings {
  stability: number        // 0–1 · lower = more emotional/variable delivery; higher = steadier/flatter
  similarity_boost: number // 0–1 · adherence to the original voice timbre
  style: number            // 0–1 · style exaggeration (drama); higher adds latency, keep moderate
  use_speaker_boost: boolean
  speed: number            // ~0.7–1.2 · narration pace
}

// Runtime validation for a client-supplied delivery override. Any API route that accepts voiceSettings
// from the client and feeds it to TTS must parse it against this (an out-of-range value would otherwise
// reach the provider mid-pipeline). Bounds mirror the interface's documented ranges.
export const VoiceSettingsSchema: z.ZodType<VoiceSettings> = z.object({
  stability: z.number().min(0).max(1),
  similarity_boost: z.number().min(0).max(1),
  style: z.number().min(0).max(1),
  use_speaker_boost: z.boolean(),
  speed: z.number().min(0.5).max(1.5),
})

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

// Story-mood keyword → delivery nudges, matched as substrings against the story's mood tags.
// Several can apply at once (their deltas sum); everything is clamped at the end so it never breaks.
const MOOD_RULES: Array<{ match: RegExp; dStability: number; dStyle: number; dSpeed: number }> = [
  // Dread/horror: RAISE stability + keep style modest. Counterintuitive but load-bearing — on ElevenLabs,
  // LOW stability produces erratic pacing, rushing, and stutter (and high style adds theatrical wobble),
  // which reads as an unhinged/jolly performance, not controlled dread. A steady, slow, low-drama read
  // is what lands as menacing. (Was dStability -0.12 / dStyle 0.08 — the source of the rushing + stutter.)
  { match: /dread|fear|terror|eerie|ominous|sinister|tense|suspense|horror|dark|haunt|unsettl|creep/i, dStability: 0.1, dStyle: 0.02, dSpeed: -0.05 },
  { match: /calm|serene|peaceful|gentle|tender|warm|hopeful|soothing/i, dStability: 0.12, dStyle: -0.05, dSpeed: -0.02 },
  { match: /sad|grief|mourn|melanchol|somber|wistful|lonely|loss|sorrow/i, dStability: 0.06, dStyle: 0, dSpeed: -0.05 },
  { match: /energetic|hype|excit|urgent|frantic|intense|epic|triumphant|thrill/i, dStability: -0.05, dStyle: 0.12, dSpeed: 0.06 },
  { match: /playful|funny|comedic|light|whimsical|quirky|cheeky/i, dStability: 0, dStyle: 0.06, dSpeed: 0.04 },
  { match: /myster|curious|intrigu|enigmat|uncanny/i, dStability: -0.04, dStyle: 0.04, dSpeed: -0.02 },
]

// Per-genre delivery ENVELOPE. Genre is the strongest signal of a channel's desired vocal character, so it
// sets the band the read must stay inside; tone + story mood only POSITION the read within that band. We
// apply it as a final clamp so no story can drift out of the genre's character — critically, a horror read
// can never rush or turn theatrical even when the story mood tagger emits nothing (the old failure: no dread
// tag → baseline stability 0.47 / style 0.3 / speed 0.96, which reads as jolly, not dread). 'general' has no
// envelope on purpose — it's the catch-all, so tone/mood drive it under the wide final clamp below.
const GENRE_ENVELOPE: Record<string, { stability: [number, number]; style: [number, number]; speed: [number, number] }> = {
  // Cold, controlled, slow — the scare is restraint. Steady enough to never rush/stutter; drama kept low;
  // deliberately slow. Tuned to the deep, measured delivery that tested best (≈0.55 / 0.10 / 0.88).
  horror: { stability: [0.53, 0.65], style: [0.05, 0.1], speed: [0.82, 0.9] },
  // Clear and authoritative — steady, minimal drama, brisk but never rushed.
  informational: { stability: [0.45, 0.6], style: [0.05, 0.22], speed: [0.96, 1.08] },
  // Warm and natural — a little expressive, conversational pace.
  lifestyle: { stability: [0.4, 0.55], style: [0.15, 0.35], speed: [0.95, 1.06] },
  // Warm, close, controlled — feeling carried under the words, never performed; a touch slower than
  // conversation so the wound has room. (Deterministic owner-set tuning, like horror's; re-tune by ear.)
  drama: { stability: [0.45, 0.6], style: [0.12, 0.28], speed: [0.86, 0.96] },
  // Bright and alive — quicker than conversation, more expressive; the energy IS part of the joke.
  // The hang before the punchline comes from narration-pauses, not from slowing the read.
  comedy: { stability: [0.38, 0.52], style: [0.2, 0.4], speed: [0.98, 1.1] },
  // Assertive and direct — steady conviction, brisk; heat comes through style, never through rushing.
  commentary: { stability: [0.45, 0.6], style: [0.15, 0.3], speed: [1.0, 1.1] },
  // Flat-ish and real — someone typing-out-loud; natural pace, low drama, believably unpolished.
  reddit_story: { stability: [0.45, 0.62], style: [0.08, 0.22], speed: [0.96, 1.06] },
}

// Register overrides WITHIN a genre — the story's committed register (elements.register) can shift the
// envelope where one band can't serve two temperatures. Matched loosely against the free-text register.
// Same owner-set-tuning exception as the envelopes; extend per (genre, register) as listening proves need.
const REGISTER_ENVELOPE_OVERRIDES: Array<{
  genre: string
  match: RegExp
  env: { stability: [number, number]; style: [number, number]; speed: [number, number] }
}> = [
  // Horror KINETIC SHOCK: the jump-scare register moves — faster and hotter than the dread band
  // (which would smother it at 0.82–0.9 speed) while staying controlled; the scare is still earned.
  { genre: 'horror', match: /kinetic|shock|jump/i, env: { stability: [0.45, 0.58], style: [0.1, 0.2], speed: [0.92, 1.02] } },
  // Drama CONFRONTATION: the said-out-loud scene carries more heat than the quiet-ache band allows.
  { genre: 'drama', match: /confront/i, env: { stability: [0.4, 0.55], style: [0.2, 0.38], speed: [0.9, 1.0] } },
]

// Map (channel genre envelope + channel tone baseline + this reel's story mood [+ committed register])
// → ElevenLabs voice_settings. `register` is the story's committed temperature (stories.elements.register);
// when a (genre, register) override exists it replaces the genre band, so a kinetic horror story isn't
// read like quiet dread.
export function moodToVoiceSettings(mood: string[], tone: ToneConfig, genre?: string, register?: string): VoiceSettings {
  // Baseline from the channel's tone axes (0–10): higher intensity → more expressive (lower stability)
  // + more drama (style); pacing drives speed.
  let stability = clamp(0.55 - (tone.intensity - 5) * 0.04, 0.25, 0.75)
  let style = clamp(((tone.intensity + tone.energy) / 2 / 10) * 0.5, 0, 0.55)
  let speed = clamp(0.9 + (tone.pacing - 5) * 0.02, 0.8, 1.1)

  // Per-story mood nudges (sum of every matched rule).
  const tags = mood.join(' ')
  for (const r of MOOD_RULES) {
    if (r.match.test(tags)) { stability += r.dStability; style += r.dStyle; speed += r.dSpeed }
  }

  // Genre envelope — clamp into the genre's character band (dominant over tone/mood). No-op for 'general'.
  // A committed register can swap the band within its genre (see REGISTER_ENVELOPE_OVERRIDES).
  const regOverride =
    genre && register
      ? REGISTER_ENVELOPE_OVERRIDES.find((o) => o.genre === genre && o.match.test(register))?.env
      : undefined
  const env = regOverride ?? (genre ? GENRE_ENVELOPE[genre] : undefined)
  if (env) {
    stability = clamp(stability, env.stability[0], env.stability[1])
    style = clamp(style, env.style[0], env.style[1])
    speed = clamp(speed, env.speed[0], env.speed[1])
  }

  return {
    stability: Number(clamp(stability, 0.2, 0.85).toFixed(3)),
    similarity_boost: 0.75,
    style: Number(clamp(style, 0, 0.6).toFixed(3)),
    use_speaker_boost: true,
    speed: Number(clamp(speed, 0.8, 1.12).toFixed(3)),
  }
}
