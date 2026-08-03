import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { getDb, channels, stories, reels, rejections, recordSpendEvent } from '@reels/db'
import { llmCall } from '@reels/providers'
import {
  buildRubricMinerPrompt,
  RubricMinerSchema,
  RUBRIC_MINER_V1_VERSION,
} from '@reels/core/prompts/rubric-miner.v1'
import { REJECTION_REASON_LABELS } from '@reels/core/assembly/avoidlist'
import { requireChannelOwner, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

const InputSchema = z.object({
  channelId: z.string().uuid(),
})

// Draft a taste rubric from the operator's own decisions on this channel: stories they approved
// at spot-check (isReference) as positives, rejection reasons+notes as anti-patterns. Returns a
// DRAFT only — saving goes through the normal channel PATCH after the operator reviews/edits it.
export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const gate = await requireChannelOwner(parsed.data.channelId)
  if (gate instanceof NextResponse) return gate
  // Paid call — respect the caller's monthly spend cap before spending (these routes were the gap:
  // setup, preview, and research spend ran with no budget gate at all).
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, parsed.data.channelId) })
  if (!channel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Positives: approved stories, best-performing first.
  const approved = await db.query.stories.findMany({
    where: and(eq(stories.channelId, channel.id), eq(stories.isReference, true)),
    orderBy: [desc(stories.performanceScore), desc(stories.createdAt)],
    limit: 10,
  })

  // Negatives: every rejection on this channel's reels, aggregated by reason.
  const channelReels = await db.query.reels.findMany({
    where: eq(reels.channelId, channel.id),
    columns: { id: true },
  })
  const reelIds = channelReels.map((r) => r.id)
  const channelRejections = reelIds.length
    ? await db.query.rejections.findMany({ where: inArray(rejections.reelId, reelIds) })
    : []

  if (approved.length === 0 && channelRejections.length === 0) {
    return NextResponse.json(
      { error: 'Nothing to learn from yet — approve or pass on a few stories first.' },
      { status: 400 },
    )
  }

  const referenceStories = approved
    .map((s, i) => `--- APPROVED ${i + 1}: ${s.title} ---\n${s.body}`)
    .join('\n\n')

  const byReason = channelRejections.reduce<Record<string, { count: number; notes: string[] }>>((acc, r) => {
    const entry = (acc[r.reasonCode] ??= { count: 0, notes: [] })
    entry.count += 1
    const note = r.note?.trim()
    if (note) entry.notes.push(note)
    return acc
  }, {})
  const rejectionSummary = Object.entries(byReason)
    .map(([code, { count, notes }]) => {
      const label = REJECTION_REASON_LABELS[code] ?? code
      const noteText = notes.length ? ` — operator notes: ${notes.map((n) => `"${n}"`).join('; ')}` : ''
      return `${label} ×${count}${noteText}`
    })
    .join('\n')

  const { system, userMessage } = buildRubricMinerPrompt({
    channelName: channel.name,
    nicheDescription: channel.nicheDescription,
    referenceStories,
    rejectionSummary,
  })

  try {
    const result = await llmCall({
      templateVersion: RUBRIC_MINER_V1_VERSION,
      schema: RubricMinerSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      provider: 'anthropic',
      maxTokens: 2048,
    })
    // Settings-time spend the caller discarded. Attributed to the channel it was mined for.
    await recordSpendEvent({
      userId: gate.id,
      channelId: channel.id,
      surface: 'channel_mine_rubric',
      provider: 'anthropic',
      costCents: result.costCents,
    })
    return NextResponse.json({ rubric: result.data.rubric, costCents: result.costCents })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, channelId: channel.id, surface: 'channel_mine_rubric', provider: 'openai' })
    console.error('[mine-rubric] failed:', err)
    return NextResponse.json({ error: 'Could not draft the rubric. Try again.' }, { status: 502 })
  }
}
