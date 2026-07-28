// Scheduled → live. YouTube is what actually publishes a scheduled video (we hand it status.publishAt
// at upload), so this job doesn't post anything — it brings our own records in line with the slot that
// has now passed: the publication becomes 'published' and the reel leaves 'scheduled'.
//
// Why it matters beyond bookkeeping: the metrics poll only looks at publications with a publishedAt,
// so until this runs a scheduled reel is invisible to the performance loop. publishedAt is set to the
// SLOT, not to now, so a late tick still records the true go-live time.
//
// Runs every 15 minutes — the lag only affects how quickly the UI stops saying "scheduled".

import { and, eq, isNotNull, lte } from 'drizzle-orm'
import { getDb, reels, publications } from '@reels/db'
import { canTransition, type ReelStatus } from '@reels/core'
import { makeQueue, QUEUE } from '@reels/queue'

export const PUBLISH_PROMOTE_JOB = 'publish_promote'

export async function registerPublishPromoteSchedule(): Promise<void> {
  const q = makeQueue(QUEUE.SCHEDULER)
  await q.add(PUBLISH_PROMOTE_JOB, {}, { repeat: { pattern: '*/15 * * * *' } })
}

export async function runPublishPromote(): Promise<void> {
  const db = getDb()
  const now = new Date()

  const due = await db.query.publications.findMany({
    where: and(
      eq(publications.status, 'scheduled'),
      isNotNull(publications.scheduledAt),
      lte(publications.scheduledAt, now),
    ),
  })
  if (due.length === 0) return

  let promoted = 0
  for (const pub of due) {
    // Guard on status so a concurrent tick can't double-promote (and so publishedAt is written once).
    const [updated] = await db
      .update(publications)
      .set({ status: 'published', publishedAt: pub.scheduledAt })
      .where(and(eq(publications.id, pub.id), eq(publications.status, 'scheduled')))
      .returning({ id: publications.id })
    if (!updated) continue
    promoted++

    // The reel follows only if it's still sitting at 'scheduled' — never regress one the operator
    // already moved on (rejected/failed), and the state machine is the authority on what's legal.
    const reel = await db.query.reels.findFirst({ where: eq(reels.id, pub.reelId), columns: { status: true } })
    if (reel?.status === 'scheduled' && canTransition(reel.status as ReelStatus, 'published')) {
      await db.update(reels).set({ status: 'published', updatedAt: new Date() }).where(eq(reels.id, pub.reelId))
    }
  }

  if (promoted) console.log(`[publish-promote] ${promoted} scheduled post(s) are now live`)
}
