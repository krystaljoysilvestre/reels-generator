import { NextResponse } from 'next/server'
import { llmCall } from '@reels/providers'
import {
  buildTrendingNichesPrompt,
  TrendingNichesSchema,
  TRENDING_NICHES_V1_VERSION,
  type TrendingNiches,
} from '@reels/core/prompts/trending-niches.v1'
import { getSession } from '@/lib/auth'

// "Trending now" suggestions for the channel wizard — LIVE web-searched niches with strong current
// RPM, refreshed at most once a day (module cache) so the whole app shares one ~5¢ search call.
// Best-effort: on failure the wizard simply doesn't show the rail (static presets always work).

const TTL_MS = 24 * 60 * 60 * 1000
let cache: { at: number; data: TrendingNiches; costCents: number } | null = null
let inflight: Promise<{ data: TrendingNiches; costCents: number }> | null = null

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ niches: cache.data.niches, costCents: 0, cached: true })
  }

  try {
    // Single-flight: concurrent wizard opens share one search call instead of racing several.
    const flight = (inflight ??= (async () => {
      const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      const { system, userMessage } = buildTrendingNichesPrompt({ currentDate })
      const res = await llmCall({
        templateVersion: TRENDING_NICHES_V1_VERSION,
        schema: TrendingNichesSchema,
        system,
        messages: [{ role: 'user', content: userMessage }],
        webSearch: true, // live results — the whole point; never answer from model memory
        maxTokens: 2500,
      })
      // Re-parse to resolve schema defaults (llmCall's generic infers the loose input shape).
      const data = TrendingNichesSchema.parse(res.data)
      // App-level cost (shared cache, pre-channel — no reel/channel to bill): logged for the record.
      console.log(`[trending-niches] refreshed: ${data.niches.length} niches, ${res.costCents}¢ (daily)`)
      return { data, costCents: res.costCents }
    })())
    const { data, costCents } = await flight
    cache = { at: Date.now(), data, costCents }
    return NextResponse.json({ niches: data.niches, costCents, cached: false })
  } catch (err) {
    console.warn(`[trending-niches] fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    // Stale cache beats nothing; nothing beats an error page.
    if (cache) return NextResponse.json({ niches: cache.data.niches, costCents: 0, cached: true })
    return NextResponse.json({ niches: [], costCents: 0, cached: false })
  } finally {
    inflight = null
  }
}
