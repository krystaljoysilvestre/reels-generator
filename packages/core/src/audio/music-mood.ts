import { z } from 'zod'
import type { AudioMood } from '../types/channel.js'

// Operator-facing background-music MOOD presets — a single dropdown choice that steers the bed's ARC
// (type) AND its mood TAGS together. Replaces the old preview-and-regenerate flow: the operator picks a
// mood instead of auditioning + re-rolling a generated bed. The channel's audioMood.prompt stays the base
// texture (sonic DNA); a preset layers arc + mood on top. Chosen per reel (override) or per channel (default).
// Two-axis note (Phase B, 2026-07-24): a preset fuses two SEPARABLE creative dimensions — EMOTION (color:
// dread / warm / hopeful / …) and ENERGY (motion: still / swelling / building, carried by `type`). We keep
// flat (color, motion-default) presets as the pragmatic operator palette; each prompt below keeps color words
// and motion words distinct so a future split (register/intent → vocabulary) is a refactor, not a redesign.
// `musicMood` is an operator-facing palette, NEVER the primary abstraction. When a genuinely-needed preset is
// a COMBINATION the enum can't name ("hopeful-but-restrained"), the flat enum has failed — see the
// combination-preset falsifier in hypotheses/audio-direction.md. Registers span the space: tense/dark
// (horror) AND measured / warm / hopeful / playful / wondrous / driving (Phase B range).
export const MusicMoodSchema = z.enum([
  // tense / dark
  'slow_dread',
  'eerie_sparse',
  'rising_tension',
  'sudden_scare',
  'sorrowful',
  // measured / warm / bright / energetic — Phase B register range
  'measured',
  'warm',
  'hopeful',
  'playful',
  'wondrous',
  'driving',
])
export type MusicMood = z.infer<typeof MusicMoodSchema>

type BedType = 'low_drone' | 'drone_swell' | 'riser_sting'

// label + hint are for the dropdown UI. `prompt` is the rich phrase folded into the Eleven Music prompt
// (this is what actually shapes the generated bed — far more than the terse `moodTags`). `type` + `moodTags`
// feed timing/selection. All prompts stay steady + loopable (no build-to-end), since the mixer's volume
// envelope supplies the swell toward the twist and SFX carry any hit.
export const MUSIC_MOODS: Record<MusicMood, { label: string; hint: string; type: BedType; moodTags: string[]; prompt: string }> = {
  slow_dread:     { label: 'Slow dread',     hint: 'heavy, sustained, sub-bass',        type: 'low_drone',   moodTags: ['dread', 'slow', 'heavy'],   prompt: 'A slow, heavy, sustained low drone — deep sub-bass, dread-soaked and spacious, oppressive and still, no melody or percussion.' },
  eerie_sparse:   { label: 'Eerie & sparse', hint: 'thin, cold, uneasy',                type: 'low_drone',   moodTags: ['eerie', 'sparse', 'cold'],  prompt: 'A thin, cold, sparse texture — faint high shimmer over hollow empty space, unsettling and barely-there, long silences, no melody or percussion.' },
  rising_tension: { label: 'Rising tension', hint: 'taut, insistent',                   type: 'drone_swell', moodTags: ['tense', 'rising'],          prompt: 'A taut low bed with a quiet, insistent pulsing undertone — mounting unease, coiled and restless, no melody or percussion.' },
  sudden_scare:   { label: 'Sudden scare',   hint: 'braced, coiled, held-breath',       type: 'riser_sting', moodTags: ['dread', 'sharp'],           prompt: 'A tense, coiled low tone holding dead still with dark air around it — braced, held-breath, sparse and sharp-edged, no melody or percussion.' },
  sorrowful:      { label: 'Sorrowful',      hint: 'mournful, melancholic',             type: 'low_drone',   moodTags: ['sorrow', 'melancholic'],    prompt: 'A mournful, melancholic bed — slow aching low pads, grief-heavy and tender, no percussion, no strong melody hook.' },
  // Phase B register range. Each prompt keeps COLOR (feeling) and MOTION (how it moves) as distinct clauses.
  measured:       { label: 'Measured',       hint: 'calm, documentary, present',        type: 'low_drone',   moodTags: ['measured', 'calm', 'dignified'],    prompt: 'A calm, measured documentary bed — warm sustained strings and soft piano, dignified and unhurried in feeling; it holds steady and present, sitting quietly under the narration, no melody hooks, no percussion.' },
  warm:           { label: 'Warm',           hint: 'tender, intimate',                  type: 'drone_swell', moodTags: ['warm', 'tender', 'intimate'],       prompt: 'A warm, tender, intimate bed — soft strings and gentle piano, human and close in feeling; it breathes gently, rising and receding, never intrusive, no percussion, no strong melody.' },
  hopeful:        { label: 'Hopeful',        hint: 'bright, uplifting',                 type: 'drone_swell', moodTags: ['hopeful', 'bright', 'uplifting'],   prompt: 'A hopeful, bright, uplifting bed — warm strings and light piano with an open, optimistic color; it lifts and grows gradually, unhurried, no percussion.' },
  playful:        { label: 'Playful',        hint: 'light, whimsical',                  type: 'drone_swell', moodTags: ['playful', 'light', 'whimsical'],    prompt: 'A light, playful, whimsical bed — bright plucked and mallet-like tones, buoyant and airy in color; it moves with a gentle bounce, cheerful and easy, no heavy or drum-kit percussion.' },
  wondrous:       { label: 'Wonder',         hint: 'awe, magical',                      type: 'drone_swell', moodTags: ['wondrous', 'awe', 'magical'],       prompt: 'A wondrous, awe-filled bed — shimmering pads and soft bells, expansive and magical in color; it swells and opens with a sense of gentle discovery, no percussion.' },
  driving:        { label: 'Driving',        hint: 'energetic, momentum',               type: 'drone_swell', moodTags: ['driving', 'energetic', 'momentum'], prompt: 'A driving, energetic bed — forward-moving synth and strings with a steady rhythmic pulse, propulsive and confident in color; it keeps constant momentum from the first second, staying clear under the voice, no drum-kit percussion.' },
}

// Ordered options for a dropdown: [{ value, label, hint, type, moodTags, prompt }].
export const MUSIC_MOOD_OPTIONS = (Object.keys(MUSIC_MOODS) as MusicMood[]).map((value) => ({ value, ...MUSIC_MOODS[value] }))

// Resolve the bed's arc + mood tags + generation prompt for a reel, in priority order:
//   reel override → channel default → the channel's LLM-derived audioMood (pre-preset fallback, so a
//   channel/reel with no preset set keeps its existing sound and needs no backfill).
// `prompt` is the preset's rich phrase (null on the audioMood fallback — there, audioMood.prompt IS the base).
export function resolveMusicMood(
  reelMood: MusicMood | null | undefined,
  channelMood: MusicMood | null | undefined,
  audioMood: AudioMood | undefined,
): { type: BedType; moodTags: string[]; prompt: string | null } {
  const preset = reelMood ?? channelMood ?? null
  if (preset) return { type: MUSIC_MOODS[preset].type, moodTags: MUSIC_MOODS[preset].moodTags, prompt: MUSIC_MOODS[preset].prompt }
  return { type: audioMood?.type ?? 'low_drone', moodTags: audioMood?.moodTags ?? [], prompt: null }
}
