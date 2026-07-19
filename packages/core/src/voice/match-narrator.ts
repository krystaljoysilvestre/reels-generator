import type { ChannelVoice } from '../types/channel.js'
import type { NarratorVoice } from '../types/story.js'

const AGE_ORDER = ['young', 'adult', 'older'] as const

// Auto-cast a narrator to a channel-pool voice by the story's narrator profile: gender first, then
// age band WHEN the pool carries it. "Apply only if applicable, default if not" — with no profile,
// a neutral narrator, an empty pool, or no voice that actually fits the narrator's gender, it
// returns the pool's default (first) voice rather than casting a clashing one. Deterministic:
// stable pool order, first wins ties, so the same story always casts the same voice.
export function matchNarratorVoice(
  pool: ChannelVoice[],
  narrator?: NarratorVoice | null,
): ChannelVoice | undefined {
  if (!pool.length) return undefined
  const fallback = pool[0]!
  // No usable signal → the channel's default voice.
  if (!narrator || narrator.gender === 'neutral') return fallback

  let best = fallback
  let bestScore = -Infinity
  for (const v of pool) {
    let score = 0
    const vg = (v.gender ?? '').toLowerCase()
    if (vg === narrator.gender) score += 2
    else if (vg !== 'neutral' && vg !== '') score -= 2 // a definite, wrong gender
    if (v.age) {
      const dist = Math.abs(AGE_ORDER.indexOf(v.age) - AGE_ORDER.indexOf(narrator.ageBand))
      score += dist === 0 ? 1 : dist === 1 ? 0 : -0.5
    }
    if (score > bestScore) {
      bestScore = score
      best = v
    }
  }
  // If nothing positively fits (e.g. every pool voice is the wrong gender), don't cast a clash —
  // fall back to the default voice.
  return bestScore > 0 ? best : fallback
}
