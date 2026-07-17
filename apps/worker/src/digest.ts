// Daily "ready to post" digest — one morning email so a hands-off operator knows the shelf state
// without opening the app. Env-gated via Resend (RESEND_API_KEY + DIGEST_EMAIL_TO + DIGEST_EMAIL_FROM);
// silently skipped when unset. Sent only when there's something to say (ready reels, stalls, pauses,
// failures) — a quiet portfolio sends nothing.
//
// Cost: Resend free tier is 100 emails/day — one digest/day is comfortably inside it (0¢ marginal).

import { and, eq, count, gte, inArray } from 'drizzle-orm'
import { getDb, channels, reels, stories } from '@reels/db'
import { PostingRulesSchema, UNSHIPPED_REEL_STATUSES, autoProduceBacklogCap } from '@reels/core'
import { makeQueue, QUEUE } from '@reels/queue'

export const DAILY_DIGEST_JOB = 'daily_digest'

export function isDigestConfigured(): boolean {
  return Boolean(process.env['RESEND_API_KEY'] && process.env['DIGEST_EMAIL_TO'] && process.env['DIGEST_EMAIL_FROM'])
}

// 22:00 UTC = 6AM PHT — on the operator's desk with the morning coffee.
export async function registerDigestSchedule(): Promise<void> {
  const q = makeQueue(QUEUE.SCHEDULER)
  await q.add(DAILY_DIGEST_JOB, {}, { repeat: { pattern: '0 22 * * *' } })
}

interface ChannelDigest {
  name: string
  ready: number
  needsAttention: number
  failed: number
  paused: boolean
}

export async function runDailyDigest(): Promise<void> {
  if (!isDigestConfigured()) return

  const db = getDb()
  const activeChannels = await db.query.channels.findMany({ where: eq(channels.status, 'active') })

  const digests: ChannelDigest[] = []
  for (const channel of activeChannels) {
    const countWhere = async (where: Parameters<typeof and>[0]) =>
      (await db.select({ n: count() }).from(reels).where(and(eq(reels.channelId, channel.id), where)))[0]?.n ?? 0

    const ready = await countWhere(eq(reels.status, 'approved'))
    const failed = await countWhere(eq(reels.status, 'failed'))
    const rows = await db.query.reels.findMany({
      where: eq(reels.channelId, channel.id),
      columns: { status: true, alertNote: true },
    })
    const needsAttention = rows.filter((r) => r.alertNote).length
    const rules = PostingRulesSchema.safeParse(channel.postingRules ?? {})
    const unshipped = rows.filter((r) => (UNSHIPPED_REEL_STATUSES as readonly string[]).includes(r.status)).length
    const paused =
      !!rules.success && rules.data.autoProduce.enabled && unshipped >= autoProduceBacklogCap(rules.data.autoProduce.reelsPerDay)

    if (ready || failed || needsAttention || paused) {
      digests.push({ name: channel.name, ready, needsAttention, failed, paused })
    }
  }

  // Sampled auditing: on fully-auto channels no human ever watches a reel unless they choose to —
  // so each digest nominates ONE recent finished reel for a 60-second spot watch. Keeps a taste
  // check in the loop at about a minute a day.
  let spotCheck: { title: string; channelName: string; reelId: string } | null = null
  const autoChannels = new Map(activeChannels.filter((c) => c.generationMode === 'auto').map((c) => [c.id, c.name]))
  if (autoChannels.size > 0) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const candidates = await db.query.reels.findMany({
      where: and(
        inArray(reels.channelId, [...autoChannels.keys()]),
        inArray(reels.status, ['approved', 'published']),
        gte(reels.createdAt, weekAgo),
      ),
      columns: { id: true, channelId: true, storyId: true },
    })
    const pick = candidates[Math.floor(Math.random() * candidates.length)]
    if (pick) {
      const story = pick.storyId ? await db.query.stories.findFirst({ where: eq(stories.id, pick.storyId), columns: { title: true } }) : null
      spotCheck = { title: story?.title ?? 'Untitled', channelName: autoChannels.get(pick.channelId) ?? '', reelId: pick.id }
    }
  }

  if (digests.length === 0 && !spotCheck) return // nothing worth an email

  const totalReady = digests.reduce((s, d) => s + d.ready, 0)
  const lines = digests.map((d) => {
    const bits = [
      d.ready ? `${d.ready} ready to post` : null,
      d.paused ? 'production paused — post or clear the backlog' : null,
      d.needsAttention ? `${d.needsAttention} need${d.needsAttention === 1 ? 's' : ''} attention` : null,
      d.failed ? `${d.failed} failed` : null,
    ].filter(Boolean)
    return `<li><strong>${escapeHtml(d.name)}</strong> — ${bits.join(' · ')}</li>`
  })

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env['RESEND_API_KEY']}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env['DIGEST_EMAIL_FROM'],
      to: [process.env['DIGEST_EMAIL_TO']],
      subject:
        totalReady > 0
          ? `${totalReady} reel${totalReady === 1 ? '' : 's'} ready to post`
          : digests.length > 0
            ? 'Your channels need a look'
            : 'Today’s spot check',
      html: [
        `<p>Good morning — here's the shelf:</p>`,
        lines.length ? `<ul>${lines.join('')}</ul>` : '',
        spotCheck
          ? `<p>🎬 Today's spot check: <a href="${appUrl}/storyboard/${spotCheck.reelId}">watch “${escapeHtml(spotCheck.title)}”</a> (${escapeHtml(spotCheck.channelName)}) — 60 seconds to keep an eye on what goes out on its own.</p>`
          : '',
        `<p><a href="${appUrl}/dashboard">Open the studio</a></p>`,
      ].filter(Boolean).join(''),
    }),
  })
  if (!res.ok) {
    console.warn(`[digest] send failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  } else {
    console.log(`[digest] sent — ${digests.length} channel(s), ${totalReady} ready`)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
