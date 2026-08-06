import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import {
  buildChannelClarifyPrompt,
  ChannelClarifySchema,
  CHANNEL_CLARIFY_V1_VERSION,
} from '@reels/core/prompts/channel-clarify.v1'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

// Follow-up questions for a hand-written channel pitch, fetched by the wizard while the creator is
// still on step 1 (blur / typing lull) — see channel-clarify.v1 for why this isn't the full derive.
// FIRE-AND-FORGET on the client: a failure here just means no questions, so errors stay quiet.

const InputSchema = z.object({
  // Below ~30 chars there isn't enough pitch to know what's missing — the client guards the same
  // bound, so this only rejects hand-rolled calls.
  nicheDescription: z.string().trim().min(30).max(8000),
  language: z.string().trim().min(1).max(40).default('English'), // narration language — the fallback for question language
})

// Idempotency cache, same pattern as the derive route: the wizard fires on blur AND on a typing
// lull, so the identical text can arrive twice within seconds — the second must be free.
type CacheEntry = { at: number; questions: z.infer<typeof ChannelClarifySchema>['questions'] }
const CLARIFY_TTL_MS = 30 * 60 * 1000
const CLARIFY_CACHE_MAX = 200
const clarifyCache = new Map<string, CacheEntry>()

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  // Paid call — respect the caller's monthly spend cap before spending.
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { nicheDescription, language } = parsed.data

  const key = createHash('sha256').update(`${language.toLowerCase()}|${nicheDescription.trim().toLowerCase()}`).digest('hex')
  const cached = clarifyCache.get(key)
  if (cached && Date.now() - cached.at < CLARIFY_TTL_MS) {
    // costCents 0 on a cache hit — nothing was paid (the never-charge-on-a-cache-hit rule).
    return NextResponse.json({ questions: cached.questions, costCents: 0, cached: true })
  }

  const { system, userMessage } = buildChannelClarifyPrompt({ nicheDescription, language })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_CLARIFY_V1_VERSION,
      schema: ChannelClarifySchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 400, // 0–2 short questions — anything longer is the model padding
    })
    await recordSpendEvent({ userId: gate.id, surface: 'channel_clarify', provider: 'openai', costCents: result.costCents })
    const questions = result.data.questions ?? []
    clarifyCache.set(key, { at: Date.now(), questions })
    if (clarifyCache.size > CLARIFY_CACHE_MAX) {
      const now = Date.now()
      for (const [k, v] of clarifyCache) if (now - v.at >= CLARIFY_TTL_MS) clarifyCache.delete(k)
      while (clarifyCache.size > CLARIFY_CACHE_MAX) clarifyCache.delete(clarifyCache.keys().next().value!)
    }
    return NextResponse.json({ questions, costCents: result.costCents })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, surface: 'channel_clarify', provider: 'openai' })
    console.error('[channel/clarify] failed:', err)
    return NextResponse.json({ error: 'Clarify failed' }, { status: 502 })
  }
}
