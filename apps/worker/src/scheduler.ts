// The consistency engine — auto-produce reels on the channel's cadence (postingRules.autoProduce).
//
// A repeatable BullMQ job ticks every 30 minutes. For each active channel with auto-produce on, it
// creates AT MOST ONE reel per tick until the day's quota (reelsPerDay) is met, starting at
// startHourUtc — so a 3-a-day channel spreads its reels across the day instead of bursting.
// Gates behave per the channel's generationMode: 'auto' runs each reel to a finished render;
// 'review' queues the story for approval (wake up to drafts waiting in the review queue).
// Posting stays manual either way — this fills the shelf, the operator ships it.
//
// Backstops:
//  - backlog guard: if unpublished reels pile up (operator away, or something failing), production
//    pauses instead of burning budget into a queue nobody is clearing.
//  - quota counts every reel created today (any status), so retries/failures don't over-produce.

import { and, eq, gte, inArray } from 'drizzle-orm'
import { count } from 'drizzle-orm'
import { getDb, channels, reels } from '@reels/db'
import { PostingRulesSchema, UNSHIPPED_REEL_STATUSES, autoProduceBacklogCap } from '@reels/core'
import { makeQueue, enqueueStep, QUEUE } from '@reels/queue'

export const AUTO_PRODUCE_JOB = 'auto_produce_tick'

// Register the repeatable tick (idempotent — BullMQ dedupes by name+pattern; re-adding on boot is safe).
export async function registerAutoProduceSchedule(): Promise<void> {
  const q = makeQueue(QUEUE.SCHEDULER)
  await q.add(AUTO_PRODUCE_JOB, {}, { repeat: { pattern: '*/30 * * * *' } })
}

export async function runAutoProduceTick(): Promise<void> {
  const db = getDb()
  const now = new Date()
  const utcHour = now.getUTCHours()
  const utcDayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

  const activeChannels = await db.query.channels.findMany({ where: eq(channels.status, 'active') })

  for (const channel of activeChannels) {
    const rules = PostingRulesSchema.safeParse(channel.postingRules ?? {})
    if (!rules.success || !rules.data.autoProduce.enabled) continue
    const { reelsPerDay, startHourUtc } = rules.data.autoProduce
    const tag = `[auto-produce] ${channel.name}`

    if (utcHour < startHourUtc) continue // today's window hasn't opened yet

    // Day quota: everything created today counts (failed/rejected too — a bad run shouldn't double-spend).
    const [madeToday] = await db
      .select({ value: count() })
      .from(reels)
      .where(and(eq(reels.channelId, channel.id), gte(reels.createdAt, utcDayStart)))
    if ((madeToday?.value ?? 0) >= reelsPerDay) continue

    // Backlog guard: don't produce into a pile nobody is shipping.
    const [unshipped] = await db
      .select({ value: count() })
      .from(reels)
      .where(and(eq(reels.channelId, channel.id), inArray(reels.status, [...UNSHIPPED_REEL_STATUSES])))
    const backlogCap = autoProduceBacklogCap(reelsPerDay)
    if ((unshipped?.value ?? 0) >= backlogCap) {
      console.warn(`${tag} paused — ${unshipped?.value} unshipped reels (cap ${backlogCap}). Ship or clear some to resume.`)
      continue
    }

    // Create ONE reel this tick (mirrors the create-reel route).
    const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
    const [reel] = await db
      .insert(reels)
      .values({ channelId: channel.id, status: 'drafting', language })
      .returning()
    await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })
    console.log(`${tag} created reel ${reel!.id.slice(0, 8)} (${(madeToday?.value ?? 0) + 1}/${reelsPerDay} today, mode=${channel.generationMode})`)
  }
}
