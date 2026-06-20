import type { MusicTrack } from '../types/channel.js'
import { PRESET_BEDS } from './preset-beds.data.js'

export { PRESET_BEDS }

// A small library of AI-pre-generated background-music beds — seeded ONCE (ElevenLabs Music)
// and reused as the "Presets" shelf in the Sound step. Same licensing basis as AI-choose; no
// third-party music. The seed script (apps/worker/scripts/seed-preset-beds.ts) generates the
// audio, uploads to R2, and rewrites preset-beds.data.ts. Each bed is audibly distinct so the
// shelf genuinely varies by niche + mood.
export interface PresetBed {
  id: string
  niche: string            // niche keyword — hybrid match + shelf label (e.g. "Horror")
  mood: string             // short mood word for the shelf label (e.g. "Dread")
  path: string             // R2 key of the .mp3
  type: MusicTrack['type']
  moodTags: string[]
}

type ToneLike = { intensity?: number; warmth?: number; energy?: number; humor?: number }
const TONE_AXES = ['intensity', 'warmth', 'energy', 'humor'] as const

// Tone profile (0–10) per NICHE — the PRIMARY ranking signal. The channel's derived tone is
// always present and reliable, unlike the LLM's free-text mood tags, so this is what keeps a
// comedy channel off the horror beds and vice-versa. Keyed by niche so all of a niche's
// variations share one profile (scales as the library grows). Keys are bed.niche lowercased.
const NICHE_TONE: Record<string, Required<ToneLike>> = {
  'horror': { intensity: 9, warmth: 2, energy: 3, humor: 0 },
  'thriller': { intensity: 8, warmth: 3, energy: 5, humor: 1 },
  'true crime': { intensity: 7, warmth: 3, energy: 3, humor: 0 },
  'mystery': { intensity: 6, warmth: 4, energy: 4, humor: 2 },
  'wellness': { intensity: 2, warmth: 9, energy: 2, humor: 2 },
  'inspirational': { intensity: 5, warmth: 8, energy: 6, humor: 3 },
  'vlog': { intensity: 3, warmth: 7, energy: 6, humor: 5 },
  'comedy': { intensity: 2, warmth: 7, energy: 7, humor: 9 },
  'hype': { intensity: 7, warmth: 4, energy: 9, humor: 3 },
  'tech': { intensity: 4, warmth: 5, energy: 5, humor: 2 },
}

// Rank beds for a channel. Primary signal = closeness of the channel's TONE to the bed's niche
// tone profile (0–40, dominant); mood-tag overlap (×2) and a niche-keyword hit (+1) refine ties.
// Custom niches/odd wording still rank sensibly because tone always discriminates.
export function rankPresets(opts: { niche?: string; moodTags?: string[]; tone?: ToneLike }): PresetBed[] {
  const want = new Set((opts.moodTags ?? []).map((t) => t.toLowerCase()))
  const nicheText = (opts.niche ?? '').toLowerCase()
  const tone = opts.tone
  return (PRESET_BEDS ?? [])
    .map((bed, i) => {
      const moodScore = bed.moodTags.reduce((n, t) => (want.has(t.toLowerCase()) ? n + 1 : n), 0)
      const nicheHit = bed.niche && nicheText.includes(bed.niche.toLowerCase()) ? 1 : 0
      const bt = NICHE_TONE[bed.niche.toLowerCase()]
      const toneScore = tone && bt
        ? 40 - TONE_AXES.reduce((d, a) => d + Math.abs((tone[a] ?? 5) - bt[a]), 0)
        : 0
      return { bed, i, score: toneScore + moodScore * 2 + nicheHit }
    })
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.bed)
}
