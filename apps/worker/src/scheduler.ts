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
import { getDb, channels, reels, getUserUsage } from '@reels/db'
import { PostingRulesSchema, UNSHIPPED_REEL_STATUSES, autoProduceBacklogCap, checkUserLimits, DEFAULT_USER_LIMITS, MAX_INFLIGHT_REELS_PER_USER, resolveGenreForNewReel, resolveChannelPolicy, requiresEvidence } from '@reels/core'
import { makeQueue, enqueueStep, QUEUE } from '@reels/queue'
import { pickNextSeriesTopic, claimSeriesTopic, skipSeriesTopic, acquireEvidence } from './series-queue.js'

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

    // Per-user budget/quota (multi-tenant safety): skip if the channel owner is over their caps, so
    // auto-produce can never drain a tester's wallet. Admins are unlimited.
    if (channel.userId) {
      const usage = await getUserUsage(channel.userId)
      if (usage && usage.role !== 'admin') {
        const res = checkUserLimits(usage, {
          monthlyBudgetCents: usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents,
          dailyReelQuota: usage.dailyReelQuota ?? DEFAULT_USER_LIMITS.dailyReelQuota,
        })
        if (!res.ok) {
          console.warn(`${tag} skipped — owner limit: ${res.reason}`)
          continue
        }
      }

      // Per-user in-flight cap across ALL the owner's channels (the backlog guard above is per-channel):
      // don't let auto-produce push a user past the same concurrency ceiling the manual create path enforces.
      const [userInflight] = await db
        .select({ value: count() })
        .from(reels)
        .innerJoin(channels, eq(reels.channelId, channels.id))
        .where(and(eq(channels.userId, channel.userId), inArray(reels.status, [...UNSHIPPED_REEL_STATUSES])))
      if ((userInflight?.value ?? 0) >= MAX_INFLIGHT_REELS_PER_USER) {
        console.warn(`${tag} skipped — owner has ${userInflight?.value} reels in progress (cap ${MAX_INFLIGHT_REELS_PER_USER}).`)
        continue
      }
    }

    // Create ONE reel this tick (mirrors the create-reel route).
    const language = (channel.languages[0] ?? 'tagalog').toLowerCase()

    // The channel's Editorial Program, if it has one (specs/channel-series.md). null = no series, or
    // every series out of topics → the Planner invents, exactly as it did before series existed.
    const pick = await pickNextSeriesTopic(channel.id, channel)
    // Resolve the genre ONCE, here, and freeze it on the row. Never re-derived downstream.
    const genreCategory = pick ? resolveGenreForNewReel({ genreCategory: pick.genreCategory }, channel) : null
    // FREEZE the resolved source policy on every reel, series or not — the same discipline as the genre.
    // A reel made under "fictional only" must never be re-judged, re-rendered or re-sourced later under
    // "real places allowed", and the channel's policy is editable at any time.
    const sourcePolicy = resolveChannelPolicy(null, null, channel)

    // ── THE INVARIANT: no factual script is ever written without evidence ─────────────────────────
    // On an evidence-required channel, acquire source material BEFORE any reel exists. Not after, and
    // not "write it and let a human catch the errors" — that makes review a hallucination-catching
    // chore and puts generation one step ahead of its own inputs. The fact gate cannot cover this
    // either: it is `factCheck && dossier`, so with no dossier it does not run at all.
    //
    // Two outcomes, and NEITHER of them is "write anyway":
    //   evidence found → the reel is created WITH the dossier, so the fidelity checker actually fires
    //   no evidence    → NO REEL. The topic is skipped (we tried; the sources aren't there) and this
    //                    tick produces nothing. A missing post is strictly better than a fabricated one.
    let acquiredDossier: string | null = null
    if (requiresEvidence(sourcePolicy)) {
      if (!pick) {
        // Evidence-required, but nothing names the subject — there is nothing to research, and letting
        // the Planner invent one is exactly the failure this guard exists for.
        console.warn(`${tag} evidence required but no queued topic — nothing to research, skipping this tick`)
        continue
      }
      const evidence = await acquireEvidence(channel, pick.subject)
      if (!evidence) {
        await skipSeriesTopic(pick.topicId, 'no usable sources found')
        console.warn(`${tag} "${pick.subject}" could not be sourced — no reel created (evidence required)`)
        continue
      }
      acquiredDossier = evidence.dossier
    }

    const [reel] = await db
      .insert(reels)
      .values({
        channelId: channel.id,
        status: 'drafting',
        language,
        sourcePolicy,
        // The acquired sources ARE the substrate the studio writes from, and their presence is what
        // makes the fact gate (`factCheck && dossier`) able to run at all on this reel.
        ...(acquiredDossier ? { dossier: acquiredDossier } : {}),
        ...(pick ? { seedIdea: pick.subject, seriesId: pick.seriesId, genreCategory } : {}),
      })
      .returning()

    // Claim the topic only AFTER the reel exists, and only if it is still queued. If another tick took
    // it in between, drop the seed rather than shipping a duplicate subject — the reel still produces a
    // planner-invented story, which is a strictly better outcome than two reels on the same topic.
    if (pick) {
      const claimed = await claimSeriesTopic(pick.topicId, reel!.id)
      if (!claimed) {
        if (requiresEvidence(sourcePolicy)) {
          // Falling back to planner-invented is NOT available here — that is precisely a factual script
          // with no evidence. The dossier we already paid for belongs to a subject another tick took, so
          // this reel has no honest subject: fail it closed rather than let it write something.
          await db.update(reels)
            .set({ status: 'failed', alertNote: 'Another reel took this subject first — nothing was written.', updatedAt: new Date() })
            .where(eq(reels.id, reel!.id))
          console.warn(`${tag} topic "${pick.subject}" claimed concurrently on an evidence-required channel — reel ${reel!.id.slice(0, 8)} failed closed`)
          continue
        }
        await db.update(reels).set({ seedIdea: null, seriesId: null, genreCategory: null }).where(eq(reels.id, reel!.id))
        console.warn(`${tag} topic "${pick.subject}" was claimed concurrently — reel ${reel!.id.slice(0, 8)} falls back to planner-invented`)
      }
    }

    await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })
    const from = pick ? ` from "${pick.seriesName}" → ${pick.subject}` : ''
    console.log(`${tag} created reel ${reel!.id.slice(0, 8)}${from} (${(madeToday?.value ?? 0) + 1}/${reelsPerDay} today, mode=${channel.generationMode})`)
  }
}
