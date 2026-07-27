import { NextResponse } from 'next/server'
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { getDb, trendingNiches } from '@reels/db'
import { llmCall } from '@reels/providers'
import {
  buildTrendingNichesPrompt,
  TrendingNichesSchema,
  TRENDING_NICHES_V1_VERSION,
  type TrendingNiches,
} from '@reels/core/prompts/trending-niches.v1'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'

// "Trending now" suggestions for the channel wizard — LIVE web-searched niches with strong current
// RPM, cached one row per UTC day in the DB so the whole app shares a single ~5¢ search call
// regardless of how many instances are running (a module cache refreshed per-instance instead).
//
// Stale-while-revalidate: the newest successful row is served immediately, so only the one request
// that claims a new day ever waits on the search. Best-effort throughout — on failure the wizard
// falls back to the previous day's row, and failing that shows no rail at all (static presets in
// niche-presets.ts always work).

const SEGMENT = 'global' // see schema: reserved for future per-region rails
const STALE_CLAIM_MS = 5 * 60 * 1000 // a claim that hasn't produced niches in 5 min is treated as dead
const MAX_ATTEMPTS_PER_DAY = 3       // a persistently failing search stops burning latency and money

/** Today as a UTC date string — matches the `date` column and the UTC-pinned DB session. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Parse a stored jsonb array back through the prompt's schema; null if the row is unusable. */
function readNiches(row: { niches: unknown } | undefined): TrendingNiches['niches'] | null {
  if (!row?.niches) return null
  const parsed = TrendingNichesSchema.safeParse({ niches: row.niches })
  return parsed.success ? parsed.data.niches : null
}

export async function GET() {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const day = utcDay()

  try {
    // Newest usable row, whatever day it's from — both the fast path (it's today's) and the
    // stale-while-revalidate fallback (it isn't, and someone else is already refreshing).
    const [newest] = await db
      .select()
      .from(trendingNiches)
      .where(and(eq(trendingNiches.segment, SEGMENT), sql`${trendingNiches.niches} is not null`))
      .orderBy(desc(trendingNiches.day))
      .limit(1)

    const cached = readNiches(newest)
    if (cached && newest?.day === day) {
      return NextResponse.json({ niches: cached, costCents: 0, cached: true })
    }

    // Today has no result yet. With a stale row in hand we never block: yesterday's niches now beat
    // today's in ~10s. Only on a cold start (nothing to fall back to) is waiting the better trade —
    // and then, if this instance is already searching, we share that result rather than duplicate it.
    if (!cached && inflight) {
      const shared = await inflight
      if (shared) return NextResponse.json({ niches: shared.niches, costCents: 0, cached: true })
    }

    // Nobody here is searching. Try to become the one request — app-wide — that pays for today. The
    // budget gate sits HERE, not at the top: reading a cached row is free, and an over-cap creator
    // should still see the rail — they just don't get to trigger the paid search. Note we deliberately
    // DISCARD the gate's 429 and serve the stale rail instead; the cap blocks spending, not reading.
    const overCap = (await requireSpendBudget(gate)) !== null
    if (overCap) {
      return NextResponse.json({ niches: cached ?? [], costCents: 0, cached: cached !== null })
    }
    if (await claimDay(db, day)) {
      const fresh = await (inflight ??= refresh(db, day, gate.id).finally(() => { inflight = null }))
      if (fresh) return NextResponse.json({ niches: fresh.niches, costCents: fresh.costCents, cached: false })
    }

    // Another instance holds the claim, or our own search failed: stale beats nothing.
    return NextResponse.json({ niches: cached ?? [], costCents: 0, cached: cached !== null })
  } catch (err) {
    console.warn(`[trending-niches] request failed: ${err instanceof Error ? err.message : String(err)}`)
    return NextResponse.json({ niches: [], costCents: 0, cached: false })
  }
}

let inflight: Promise<{ niches: TrendingNiches['niches']; costCents: number } | null> | null = null

/**
 * Atomically take responsibility for refreshing `day`, across every instance.
 *
 * Two ways to win, both single-statement so concurrent callers can't both succeed:
 *  1. Insert the day's row — only the first request of a new day gets past ON CONFLICT DO NOTHING.
 *  2. Take over a claim that died mid-search (row exists, still no niches, last attempt is older
 *     than STALE_CLAIM_MS) — without this a crashed or redeployed request would wedge the day.
 * Attempts are capped so a search that fails all day stops re-firing on every wizard open.
 */
async function claimDay(db: ReturnType<typeof getDb>, day: string): Promise<boolean> {
  const inserted = await db
    .insert(trendingNiches)
    .values({ day, segment: SEGMENT, attempts: 1, lastAttemptAt: new Date() })
    .onConflictDoNothing()
    .returning({ day: trendingNiches.day })
  if (inserted.length > 0) return true

  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS)
  const retaken = await db
    .update(trendingNiches)
    .set({ attempts: sql`${trendingNiches.attempts} + 1`, lastAttemptAt: new Date() })
    .where(
      and(
        eq(trendingNiches.day, day),
        eq(trendingNiches.segment, SEGMENT),
        isNull(trendingNiches.niches),
        lt(trendingNiches.attempts, MAX_ATTEMPTS_PER_DAY),
        or(isNull(trendingNiches.lastAttemptAt), lt(trendingNiches.lastAttemptAt, staleBefore)),
      ),
    )
    .returning({ day: trendingNiches.day })
  return retaken.length > 0
}

/** Run the paid web search and persist it as the day's row. Returns null if the search failed. */
async function refresh(
  db: ReturnType<typeof getDb>,
  day: string,
  actorUserId: string,
): Promise<{ niches: TrendingNiches['niches']; costCents: number } | null> {
  try {
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
    // Bill the day's row the moment the search is paid for, and INCREMENT rather than SET: up to
    // MAX_ATTEMPTS_PER_DAY paid searches can run in a day, and the parse below can throw on a call that
    // was already billed. A trailing SET recorded only the last successful attempt and erased the rest.
    await db
      .update(trendingNiches)
      .set({ costCents: sql`${trendingNiches.costCents} + ${res.costCents}` })
      .where(and(eq(trendingNiches.day, day), eq(trendingNiches.segment, SEGMENT)))

    // Re-parse to resolve schema defaults (llmCall's generic infers the loose input shape).
    const data = TrendingNichesSchema.parse(res.data)

    // Publishing the niches also releases the claim — every other request now reads this row.
    // Cost is app-level (shared cache, pre-channel: no reel or channel exists to bill), so it lives on
    // this row rather than in a reel's spend, and stays queryable per day alongside its actor.
    await db
      .update(trendingNiches)
      .set({
        niches: data.niches,
        refreshedByUserId: actorUserId,
        refreshedAt: new Date(),
      })
      .where(and(eq(trendingNiches.day, day), eq(trendingNiches.segment, SEGMENT)))

    console.log(
      `[trending-niches] refreshed ${day}: ${data.niches.length} niches, ${res.costCents}¢ (user ${actorUserId})`,
    )
    return { niches: data.niches, costCents: res.costCents }
  } catch (err) {
    // The attempt counter was already bumped by claimDay, so the backoff holds without extra writes.
    console.warn(`[trending-niches] refresh failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}
