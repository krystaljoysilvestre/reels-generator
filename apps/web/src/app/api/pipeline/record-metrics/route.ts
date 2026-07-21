import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, isNotNull, inArray } from 'drizzle-orm'
import { getDb, reels, stories, channels, publications, metrics as metricsTable } from '@reels/db'
import {
  PostingRulesSchema,
  scorePerformance,
  PERFORMANCE_PROMOTION_MIN_SCORE,
  PERFORMANCE_PROMOTION_MIN_LOGGED,
  type ReelMetrics,
} from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Manual performance logging (Phase 1): the operator pastes platform numbers for a published reel.
// Saving recomputes performanceScore for EVERY logged story in the channel — the score is channel-
// relative (log-scaled against the channel's best), so early channels with few data points still get
// a meaningful spread. performanceScore weights few-shot reference selection in generate_story: what
// performs shapes what gets written next.

const InputSchema = z.object({
  reelId: z.string().uuid(),
  views: z.number().int().min(0),
  likes: z.number().int().min(0).optional(),
  comments: z.number().int().min(0).optional(),
})

export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { reelId, views, likes, comments } = parsed.data

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (reel.status !== 'published') {
    return NextResponse.json({ error: 'Log numbers after the reel is published' }, { status: 409 })
  }

  const snapshot: ReelMetrics = {
    views,
    ...(likes != null ? { likes } : {}),
    ...(comments != null ? { comments } : {}),
    recordedAt: new Date().toISOString(),
  }
  await db.update(reels).set({ metrics: snapshot, updatedAt: new Date() }).where(eq(reels.id, reelId))

  // Time-series append: every log becomes a metrics row against the reel's primary publication, so
  // 24h-vs-7d curves exist once there's enough data (and API polling can join the same table later).
  // Reels published before publications existed get one backfilled on first log.
  let pub = await db.query.publications.findFirst({ where: eq(publications.reelId, reelId), columns: { id: true } })
  if (!pub) {
    const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId), columns: { postingRules: true } })
    const platform = PostingRulesSchema.parse(channel?.postingRules ?? {}).platforms[0] ?? 'fb'
    const inserted = await db
      .insert(publications)
      .values({ reelId, platform, status: 'published', publishedAt: reel.updatedAt })
      .returning({ id: publications.id })
    pub = inserted[0]!
  }
  await db.insert(metricsTable).values({
    publicationId: pub.id,
    views,
    raw: { source: 'manual', ...(likes != null ? { likes } : {}), ...(comments != null ? { comments } : {}) },
  })

  // ── Recompute channel-relative performance scores ───────────────────────────
  const logged = await db.query.reels.findMany({
    where: and(eq(reels.channelId, reel.channelId), isNotNull(reels.metrics), isNotNull(reels.storyId)),
    columns: { id: true, storyId: true, metrics: true },
  })
  const rows = logged
    .map((r) => ({ storyId: r.storyId!, views: (r.metrics as ReelMetrics | null)?.views ?? 0 }))
    .filter((r) => r.storyId)
  // Shared scoring (also used by the worker's YouTube stats poller — keep semantics identical).
  const scores = scorePerformance(rows)

  if (scores.size > 0) {
    // Few rows (one per published reel) — a per-row update loop is fine and keeps the SQL simple.
    for (const [storyId, score] of scores) {
      await db.update(stories).set({ performanceScore: score }).where(eq(stories.id, storyId))
    }
    // A story that performed is worth writing like again — promote strong scorers to reference status
    // (few-shot pool). Cold-start guard: with too few logged reels, "the channel's best" is
    // meaningless (the first log always scores 100), so promotion waits for a real comparison set.
    if (rows.length >= PERFORMANCE_PROMOTION_MIN_LOGGED) {
      const strong = [...scores.entries()].filter(([, s]) => s >= PERFORMANCE_PROMOTION_MIN_SCORE).map(([id]) => id)
      if (strong.length) {
        await db.update(stories).set({ isReference: true }).where(inArray(stories.id, strong))
      }
    }
  }

  return NextResponse.json({ ok: true })
}
