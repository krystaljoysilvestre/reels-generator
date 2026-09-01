// YouTube metrics polling — the automatic half of the performance loop. Every 6 hours, pull public
// stats for reels published to YouTube (recent ones — stats barely move after the window closes),
// append time-series metrics rows, refresh each reel's snapshot, and recompute the channel-relative
// performance scores that weight few-shot story selection. What performs shapes what gets written
// next — with zero manual logging for YouTube posts. (FB/IG stay manual via record-metrics.)
//
// Prefers a YOUTUBE_API_KEY: view counts on a public video are public data, so ONE call covers every
// channel and nothing can expire. Without a key it falls back to reading each publication with its own
// channel's OAuth grant — correct but fragile, since that grant is the publishing token and a
// Testing-mode one lasts seven days. Channels with neither are skipped, not failed: a manually-uploaded
// reel simply has no token to read with.
// Cost: Data API videos.list = 1 quota unit per 50 videos — negligible against the 10k/day quota.

import { and, eq, gte, isNotNull, inArray } from 'drizzle-orm'
import {
  getDb,
  reels,
  stories,
  publications,
  metrics as metricsTable,
  resolveYouTubeAuth,
  markConnectionError,
} from '@reels/db'
import {
  scorePerformance,
  PERFORMANCE_PROMOTION_MIN_SCORE,
  PERFORMANCE_PROMOTION_MIN_LOGGED,
  type ReelMetrics,
} from '@reels/core'
import { fetchYouTubeStats } from '@reels/providers'
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
  const db = getDb()
  const windowStart = new Date(Date.now() - POLL_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const pubs = await db.query.publications.findMany({
    where: and(
      eq(publications.platform, 'yt'),
      isNotNull(publications.platformPostId),
      gte(publications.publishedAt, windowStart),
    ),
    with: { reel: { columns: { channelId: true } } },
  })
  if (pubs.length === 0) return

  const byVideoId = new Map(pubs.map((p) => [p.platformPostId!, p]))
  const stats: Awaited<ReturnType<typeof fetchYouTubeStats>> = []

  const apiKey = process.env['YOUTUBE_API_KEY']
  if (apiKey) {
    try {
      stats.push(...(await fetchYouTubeStats([...byVideoId.keys()], { apiKey })))
    } catch (err) {
      // Nothing to park on a connection — a key failure is a configuration problem, not a creator's
      // account going stale.
      console.warn(`[metrics-poll] stats fetch failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  } else {
    // No key: one OAuth token per channel, so the ids have to be grouped before they can be read.
    const byChannel = new Map<string, typeof pubs>()
    for (const p of pubs) {
      const channelId = p.reel?.channelId
      if (!channelId) continue
      const group = byChannel.get(channelId)
      if (group) group.push(p)
      else byChannel.set(channelId, [p])
    }

    let skipped = 0
    for (const [channelId, group] of byChannel) {
      const auth = await resolveYouTubeAuth(channelId)
      if (!auth) {
        skipped += group.length
        continue
      }
      try {
        stats.push(...(await fetchYouTubeStats(group.map((p) => p.platformPostId!), auth)))
      } catch (err) {
        // An expired or revoked grant is the expected failure here. Park it on the connection so
        // Settings says "reconnect", instead of leaving the creator with a performance history that
        // silently stops growing. Set YOUTUBE_API_KEY to stop the audience read depending on this at all.
        const message = err instanceof Error ? err.message : String(err)
        console.warn(`[metrics-poll] channel ${channelId.slice(0, 8)} stats fetch failed: ${message}`)
        await markConnectionError(channelId, 'yt', message)
      }
    }
    if (skipped > 0) {
      console.log(`[metrics-poll] skipped ${skipped} publication(s) on channels with no active YouTube connection`)
    }
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
