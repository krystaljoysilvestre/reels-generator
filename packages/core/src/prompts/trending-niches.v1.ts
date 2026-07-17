// trending-niches.v1 — LIVE market suggestions for the channel wizard's "Trending now" rail.
// Runs on a web-search-enabled model (llmCall({ webSearch: true })): what faceless niches are
// working RIGHT NOW and which pay well (RPM). Refreshed daily via the route's cache — never a
// baked-in snapshot. Descriptions follow the same declarative-DNA formula as the static presets
// (niche-presets.ts): subject+angle · audience · structure · tone+narration · ending convention —
// NO instructions addressed to the creator (the text becomes permanent channel DNA if used).

import { z } from 'zod'

export const TRENDING_NICHES_V1_VERSION = 'trending-niches.v1'

export const TrendingNichesSchema = z.object({
  niches: z
    .array(
      z.object({
        // Generous caps (small search models overrun tight ones and fail the whole call);
        // the card UI clamps display length itself.
        label: z.string().min(1).max(60), // card title, e.g. "AI explained simply"
        blurb: z.string().min(1).max(160), // one-line card subtitle
        // Seeds the niche textarea — declarative channel DNA, 2–3 sentences, the preset formula.
        description: z.string().min(60).max(900),
        rpm: z.enum(['high', 'mid']), // directional monetization tier (from current reporting)
        whyNow: z.string().min(1).max(300), // one line: why this is working right now
        language: z.string().default('English'),
      }),
    )
    .min(3)
    .max(6),
})
export type TrendingNiches = z.infer<typeof TrendingNichesSchema>

export function buildTrendingNichesPrompt(v: { currentDate: string }): { system: string; userMessage: string } {
  const system = `You are a short-form video market analyst. Using CURRENT web information (search for it — do not rely on memory), identify faceless-video niches that are trending and monetize well right now.

What qualifies:
- Executable by a FACELESS, AI-narrated channel: narration over generated imagery. No personality-driven formats, no gameplay, no reaction content, nothing requiring real faces or real footage.
- Actually trending NOW (${v.currentDate}) — growing views/interest per current reporting, not evergreen folklore about "good niches".
- Monetization-aware: prefer niches with strong reported RPM/CPM (finance, business, legal, health, tech tend high; entertainment/story formats vary) — but a lower-RPM niche with exceptional current momentum may earn a "mid" slot.

For each niche, write the channel description in DECLARATIVE DNA form — it seeds a creator's channel and is read by a story-writing system on every video, so: subject + angle, the audience, the per-video structure, tone and narration style, and an ending convention. 2–3 tight sentences. NEVER address the creator ("pick your...", "you should...") — state what the channel IS. Where a niche needs a lane to work, name one concrete example lane in the description (the creator can change it).

whyNow: one honest line citing what's driving it right now (a trend, a platform shift, reported RPM) — no hype.

Card copy is TIGHT: label ≤4 words; blurb ≤8 words (a card subtitle, not a sentence); whyNow one short line.

Return ONLY JSON: {"niches": [{"label": "...", "blurb": "...", "description": "...", "rpm": "high|mid", "whyNow": "...", "language": "English"}]}`

  const userMessage = `Find 4–6 currently-trending, well-monetizing faceless short-form niches as of ${v.currentDate}. Prefer variety across subject areas; at least half should be rpm "high".`

  return { system, userMessage }
}
