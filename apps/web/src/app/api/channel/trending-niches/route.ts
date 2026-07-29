import { NextResponse } from 'next/server'
import { and, desc, eq, sql } from 'drizzle-orm'
import { getDb, trendingNiches } from '@reels/db'
import { TrendingNichesSchema, type TrendingNiches } from '@reels/core/prompts/trending-niches.v1'
import { requireApiUser } from '@/lib/api-access'

// "Trending now" suggestions for the channel wizard's rail and the empty dashboard's quick-start cards.
//
// READ-ONLY, and free. The refresh moved to the worker's `trending_refresh` job (21:00 UTC daily, plus a
// catch-up on boot), which is now the ONLY writer. Previously this route refreshed lazily on whichever
// creator opened the wizard first each day, which meant one person waited ~10s on a cold start, a shared
// app-level cost was billed to whoever happened to click, and the dashboard showed curated fallbacks
// until somebody opened the wizard. None of that applies now: no budget gate is needed here, and an
// over-cap creator sees the same rail as everyone else.
//
// Serves the newest usable row whatever day it's from, so a missed refresh degrades to yesterday's
// niches rather than an empty rail. Empty is still a valid answer — before the first successful run the
// wizard hides the rail and the dashboard falls back to curated presets, both of which always work.

const SEGMENT = 'global' // see schema: reserved for future per-region rails

export async function GET() {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate

  try {
    const [newest] = await getDb()
      .select({ niches: trendingNiches.niches })
      .from(trendingNiches)
      .where(and(eq(trendingNiches.segment, SEGMENT), sql`${trendingNiches.niches} is not null`))
      .orderBy(desc(trendingNiches.day))
      .limit(1)

    const parsed = TrendingNichesSchema.safeParse({ niches: newest?.niches })
    const niches: TrendingNiches['niches'] = parsed.success ? parsed.data.niches : []
    return NextResponse.json({ niches, costCents: 0, cached: niches.length > 0 })
  } catch (err) {
    console.warn(`[trending-niches] read failed: ${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json({ niches: [], costCents: 0, cached: false })
  }
}
