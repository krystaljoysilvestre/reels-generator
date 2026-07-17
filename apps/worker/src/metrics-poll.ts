// YouTube metrics polling — the automatic half of the performance loop. Every 6 hours, pull public
// stats for reels published to YouTube (recent ones — stats barely move after the window closes),
// append time-series metrics rows, refresh each reel's snapshot, and recompute the channel-relative
// performance scores that weight few-shot story selection. What performs shapes what gets written
// next — with zero manual logging for YouTube posts. (FB/IG stay manual via record-metrics.)
//
// Env-gated on the same YOUTUBE_* keys as uploading; silently skipped when unset.
// Cost: Data API videos.list = 1 quota unit per 50 videos — negligible against the 10k/day quota.

import { and, eq, gte, isNotNull, inArray } from 'drizzle-orm'
import { getDb, reels, stories, publications, metrics as metricsTable } from '@reels/db'
import {
  scorePerformance,
  PERFORMANCE_PROMOTION_MIN_SCORE,
  PERFORMANCE_PROMOTION_MIN_LOGGED,
  type ReelMetrics,
} from '@reels/core'
import { fetchYouTubeStats, isYouTubeConfigured } from '@reels/providers'
import { makeQueue, QUEUE } from '@reels/queue'

export const METRICS_POLL_JOB = 'metrics_poll'

// How far back to keep polling a published video. Shorts earn most views in days; 30 days catches
// the tail without polling the whole back catalog forever.
const POLL_WINDOW_DAYS = 30

export async function registerMetricsPollSchedule(): Promise<void> {
  const q = makeQueue(QUEUE.SCHEDULER)
  await q.add(METRICS_POLL_JOB, {}, { repeat: { pattern: '0 */6 * * *' } })
}

export async function runMetricsPoll(): Promise<void> {
  if (!isYouTubeConfigured()) return

  const db = getDb()
  const windowStart = new Date(Date.now() - POLL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const pubs = await db.query.publications.findMany({
    where: and(
      eq(publications.platform, 'yt'),
      isNotNull(publications.platformPostId),
      gte(publications.publishedAt, windowStart),
    ),
  })
  if (pubs.length === 0) return

  const byVideoId = new Map(pubs.map((p) => [p.platformPostId!, p]))
  let stats
  try {
    stats = await fetchYouTubeStats([...byVideoId.keys()])
  } catch (err) {
    console.warn(`[metrics-poll] stats fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    return
  }

  // Append the time series + refresh each reel's snapshot.
  const touchedChannelIds = new Set<string>()
  for (const s of stats) {
    const pub = byVideoId.get(s.videoId)
    if (!pub) continue
    await db.insert(metricsTable).values({
      publicationId: pub.id,
      views: s.views,
      raw: { source: 'youtube', likes: s.likes, comments: s.comments },
    })
    const snapshot: ReelMetrics = {
      views: s.views,
      ...(s.likes != null ? { likes: s.likes } : {}),
      ...(s.comments != null ? { comments: s.comments } : {}),
      recordedAt: new Date().toISOString(),
    }
    const [updated] = await db
      .update(reels)
      .set({ metrics: snapshot, updatedAt: new Date() })
      .where(eq(reels.id, pub.reelId))
      .returning({ channelId: reels.channelId })
    if (updated) touchedChannelIds.add(updated.channelId)
  }

  // Recompute channel-relative scores for every touched channel (same semantics as record-metrics).
  for (const channelId of touchedChannelIds) {
    const logged = await db.query.reels.findMany({
      where: and(eq(reels.channelId, channelId), isNotNull(reels.metrics), isNotNull(reels.storyId)),
      columns: { storyId: true, metrics: true },
    })
    const rows = logged
      .map((r) => ({ storyId: r.storyId!, views: (r.metrics as ReelMetrics | null)?.views ?? 0 }))
      .filter((r) => r.storyId)
    const scores = scorePerformance(rows)
    for (const [storyId, score] of scores) {
      await db.update(stories).set({ performanceScore: score }).where(eq(stories.id, storyId))
    }
    if (rows.length >= PERFORMANCE_PROMOTION_MIN_LOGGED) {
      const strong = [...scores.entries()].filter(([, s]) => s >= PERFORMANCE_PROMOTION_MIN_SCORE).map(([id]) => id)
      if (strong.length) {
        await db.update(stories).set({ isReference: true }).where(inArray(stories.id, strong))
      }
    }
  }

  console.log(`[metrics-poll] refreshed ${stats.length} video(s) across ${touchedChannelIds.size} channel(s)`)
}
