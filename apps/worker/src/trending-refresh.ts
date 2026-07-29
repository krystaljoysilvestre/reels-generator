// Daily "trending niches" refresh — the live web-searched niche rail shown on the empty dashboard and
// in the channel wizard's step 1.
//
// THIS JOB IS THE ONLY WRITER. It used to refresh lazily inside the web route, on whichever creator
// opened the wizard first that day: that made one person wait ~10s on a cold start, billed a shared
// app-level cost to whoever happened to click, and left the dashboard showing curated fallbacks until
// somebody opened the wizard. On a schedule the data is warm before anyone logs in, and the route is a
// pure cached read. `GET /api/channel/trending-niches` no longer spends anything.
//
// Cost: ONE web-search call per UTC day, app-wide (~5¢), whether one creator logs in or a hundred.
// Stale-while-revalidate is the failure mode: the route serves the newest usable row whatever day it's
// from, so a missed run degrades to yesterday's niches rather than an empty rail.

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { getDb, trendingNiches } from '@reels/db'
import { llmCall } from '@reels/providers'
import {
  buildTrendingNichesPrompt,
  TrendingNichesSchema,
  TRENDING_NICHES_V1_VERSION,
} from '@reels/core/prompts/trending-niches.v1'
import { makeQueue, QUEUE } from '@reels/queue'

export const TRENDING_REFRESH_JOB = 'trending_refresh'

const SEGMENT = 'global' // see schema: reserved for future per-region rails
const STALE_CLAIM_MS = 5 * 60 * 1000 // a claim that hasn't produced niches in 5 min is treated as dead
const MAX_ATTEMPTS_PER_DAY = 3 // a persistently failing search stops burning latency and money

/** Today as a UTC date string — matches the `date` column and the UTC-pinned DB session. */
function utcDay(): string {
  return new Date().toISOString().slice(0, 10)
}

// 21:00 UTC = 5AM PHT — fresh before the operator's day starts, and an hour clear of the 22:00 digest
// so the two don't contend for the single scheduler worker.
export async function registerTrendingRefreshSchedule(): Promise<void> {
  const q = makeQueue(QUEUE.SCHEDULER)
  await q.add(TRENDING_REFRESH_JOB, {}, { repeat: { pattern: '0 21 * * *' } })
}

/**
 * Atomically take responsibility for refreshing `day`.
 *
 * Kept even though this job is now the only writer, because it's what makes the boot catch-up safe:
 * several deploys in a day each call runTrendingRefresh(), and only the first may pay. Two ways to win,
 * both single-statement so concurrent callers can't both succeed:
 *  1. Insert the day's row — only the first caller of a new day gets past ON CONFLICT DO NOTHING.
 *  2. Take over a claim that died mid-search (row exists, still no niches, last attempt older than
 *     STALE_CLAIM_MS) — without this a crashed or redeployed run would wedge the day.
 * Attempts are capped so a search failing all day stops re-firing.
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

/** True when today already has a usable row — nothing to do. */
async function alreadyFresh(db: ReturnType<typeof getDb>, day: string): Promise<boolean> {
  const [row] = await db
    .select({ day: trendingNiches.day })
    .from(trendingNiches)
    .where(
      and(eq(trendingNiches.day, day), eq(trendingNiches.segment, SEGMENT), sql`${trendingNiches.niches} is not null`),
    )
    .limit(1)
  return row !== undefined
}

/**
 * Run the day's search and publish it. Safe to call more than once a day — the claim makes every call
 * after the first a no-op, which is what lets the scheduler call it on boot as well as on the cron.
 * `refreshedByUserId` stays null: a scheduled run has no actor, unlike the old creator-triggered path.
 */
export async function runTrendingRefresh(): Promise<void> {
  const db = getDb()
  const day = utcDay()

  if (await alreadyFresh(db, day)) {
    console.log(`[trending-refresh] ${day} already fresh — skipping`)
    return
  }
  if (!(await claimDay(db, day))) {
    console.log(`[trending-refresh] ${day} claimed elsewhere or out of attempts — skipping`)
    return
  }

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

    // Bill the row the moment the search is paid for, and INCREMENT rather than SET: up to
    // MAX_ATTEMPTS_PER_DAY paid searches can run in a day, and the parse below can throw on a call that
    // was already billed. A trailing SET recorded only the last attempt and erased the rest.
    await db
      .update(trendingNiches)
      .set({ costCents: sql`${trendingNiches.costCents} + ${res.costCents}` })
      .where(and(eq(trendingNiches.day, day), eq(trendingNiches.segment, SEGMENT)))

    // Re-parse to resolve schema defaults (llmCall's generic infers the loose input shape).
    const data = TrendingNichesSchema.parse(res.data)

    // Publishing the niches also releases the claim — every reader now sees this row.
    await db
      .update(trendingNiches)
      .set({ niches: data.niches, refreshedAt: new Date() })
      .where(and(eq(trendingNiches.day, day), eq(trendingNiches.segment, SEGMENT)))

    console.log(`[trending-refresh] ${day}: ${data.niches.length} niches, ${res.costCents}¢`)
  } catch (err) {
    // The attempt counter was already bumped by claimDay, so the backoff holds without extra writes.
    // Not rethrown: a failed search must not retry-storm the queue, and readers fall back to the
    // newest usable row (yesterday's niches) on their own.
    console.warn(`[trending-refresh] ${day} failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}
