import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import {
  buildChannelDerivationPrompt,
  ChannelDerivationSchema,
  CHANNEL_V1_VERSION,
} from '@reels/core/prompts/channel.v1'
import { TargetPlatformSchema } from '@reels/core'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nicheDescription: z.string().trim().min(20).max(8000),
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
  targetPlatform: TargetPlatformSchema.default('all'),
})

// Idempotency cache: a derive is a pure function of its inputs, so a retry with the SAME inputs
// (e.g. the user reloaded mid-generate, lost the result, and clicked again) returns the prior
// result instead of re-charging the model. In-memory + per-instance — best-effort, not durable.
type DeriveResult = z.input<typeof ChannelDerivationSchema> // matches llmCall's returned data shape
// No costCents here on purpose: a cache hit is free, so there is no cost to replay.
type CacheEntry = { at: number; derived: DeriveResult }
const DERIVE_TTL_MS = 30 * 60 * 1000 // 30 min — covers a reload/retry, short enough to stay fresh
const DERIVE_CACHE_MAX = 200
const deriveCache = new Map<string, CacheEntry>()

function cacheKey(input: z.infer<typeof InputSchema>): string {
  const norm = JSON.stringify({
    name: input.name.trim().toLowerCase(),
    niche: input.nicheDescription.trim().toLowerCase(),
    languages: input.languages.map((l) => l.trim().toLowerCase()).sort(),
    platform: input.targetPlatform,
  })
  return createHash('sha256').update(norm).digest('hex')
}

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  // Paid call — respect the caller's monthly spend cap before spending (these routes were the gap:
  // setup, preview, and research spend ran with no budget gate at all).
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const { name, nicheDescription, languages, targetPlatform } = parsed.data

  // Return a recent identical derive instead of paying for it again.
  const key = cacheKey(parsed.data)
  const cached = deriveCache.get(key)
  if (cached && Date.now() - cached.at < DERIVE_TTL_MS) {
    // costCents 0 on a cache hit — nothing was paid. It used to echo the original call's cost, which the
    // wizard then added to its running total a second time (the never-charge-on-a-cache-hit rule).
    return NextResponse.json({ derived: cached.derived, costCents: 0, cached: true })
  }

  const { system, userMessage } = buildChannelDerivationPrompt({ name, nicheDescription, languages, targetPlatform })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_V1_VERSION,
      schema: ChannelDerivationSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2048,
    })
    await recordSpendEvent({ userId: gate.id, surface: 'channel_derive', provider: 'openai', costCents: result.costCents })
    deriveCache.set(key, { at: Date.now(), derived: result.data })
    // Bound the cache: when it grows past the cap, drop expired entries (and oldest if still over).
    if (deriveCache.size > DERIVE_CACHE_MAX) {
      const now = Date.now()
      for (const [k, v] of deriveCache) if (now - v.at >= DERIVE_TTL_MS) deriveCache.delete(k)
      while (deriveCache.size > DERIVE_CACHE_MAX) deriveCache.delete(deriveCache.keys().next().value!)
    }
    return NextResponse.json({ derived: result.data, costCents: result.costCents })
  } catch (err) {
    // Log the provider/SDK detail server-side; return a fixed message so internals (endpoints, model
    // names, bucket keys) don't leak to the client.
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, surface: 'channel_derive', provider: 'openai' })
    console.error('[channel/derive] failed:', err)
    return NextResponse.json({ error: 'Derivation failed' }, { status: 502 })
  }
}
