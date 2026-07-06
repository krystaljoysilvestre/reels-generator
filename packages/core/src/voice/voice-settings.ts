// Per-reel narration delivery. ElevenLabs `voice_settings` shape the SAME chosen voice's performance
// — the difference between a flat read and a slow, breathy, dread-soaked one. We DERIVE these (no
// operator UI) from the channel's tone baseline + THIS reel's story mood, so a tense story is
// delivered differently from a wistful one while staying in the channel's character.
import type { ToneConfig } from '../types/channel.js'

export interface VoiceSettings {
  stability: number        // 0–1 · lower = more emotional/variable delivery; higher = steadier/flatter
  similarity_boost: number // 0–1 · adherence to the original voice timbre
  style: number            // 0–1 · style exaggeration (drama); higher adds latency, keep moderate
  use_speaker_boost: boolean
  speed: number            // ~0.7–1.2 · narration pace
}

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
}

// Map (channel genre envelope + channel tone baseline + this reel's story mood) → ElevenLabs voice_settings.
export function moodToVoiceSettings(mood: string[], tone: ToneConfig, genre?: string): VoiceSettings {
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
  const env = genre ? GENRE_ENVELOPE[genre] : undefined
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
