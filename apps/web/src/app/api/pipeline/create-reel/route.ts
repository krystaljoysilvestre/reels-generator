import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, getUserUsage } from '@reels/db'
import { and, count, eq, inArray } from 'drizzle-orm'
import { enqueueStep } from '@reels/queue'
import { checkUserLimits, DEFAULT_USER_LIMITS, MAX_INFLIGHT_REELS_PER_USER, UNSHIPPED_REEL_STATUSES } from '@reels/core'
import { requireApiUser } from '@/lib/api-access'
import { userOwnsChannel } from '@/lib/access'

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate

  const { channelId, generationMode, seed } = (await req.json().catch(() => ({}))) as {
    channelId?: string
    generationMode?: string
    seed?: string
  }
  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 })

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  if (!(await userOwnsChannel(user, channelId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Per-user budget/quota (multi-tenant cost safety). Admins are unlimited.
  if (user.role !== 'admin') {
    const usage = await getUserUsage(user.id)
    if (usage) {
      const res = checkUserLimits(usage, {
        monthlyBudgetCents: usage.monthlyBudgetCents ?? DEFAULT_USER_LIMITS.monthlyBudgetCents,
        dailyReelQuota: usage.dailyReelQuota ?? DEFAULT_USER_LIMITS.dailyReelQuota,
      })
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 429 })
    }

    // In-flight concurrency cap: bound how many reels this user can have building at once, so a burst of
    // creates can't all clear the (lagging) budget gate at $0 and then run past it in parallel. The
    // mid-pipeline assertUserBudget re-check enforces the dollar total; this smooths the burst.
    const [inflight] = await db
      .select({ n: count() })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .where(and(eq(channels.userId, user.id), inArray(reels.status, [...UNSHIPPED_REEL_STATUSES])))
    if ((inflight?.n ?? 0) >= MAX_INFLIGHT_REELS_PER_USER) {
      return NextResponse.json(
        { error: `Too many reels in progress (max ${MAX_INFLIGHT_REELS_PER_USER}). Finish or clear some first.` },
        { status: 429 },
      )
    }
  }

  // First reel sets how this channel produces reels — 'review' (stop at the human gates) or 'auto'
  // (run end-to-end to a finished render). Persisted on the channel; the worker reads it per gate.
  if (generationMode === 'auto' || generationMode === 'review') {
    await db.update(channels).set({ generationMode, updatedAt: new Date() }).where(eq(channels.id, channelId))
  }

  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const [reel] = await db.insert(reels).values({
    channelId: channel.id,
    status: 'drafting',
    language,
    // Optional topic request ("make one about …") — the story planner honors it for this reel only.
    ...(typeof seed === 'string' && seed.trim() ? { seedIdea: seed.trim().slice(0, 500) } : {}),
  }).returning()

  // Kick off the pipeline: generate_story runs, then the chain STOPS at the story_review gate
  // (operator approves the story before scenes/images are generated).
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })

  return NextResponse.json({ reelId: reel!.id })
}
