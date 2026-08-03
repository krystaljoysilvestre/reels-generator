import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import { WorldBibleSchema, ToneConfigSchema } from '@reels/core'
import {
  buildStyleOptionsPrompt,
  StyleOptionsSchema,
  STYLE_OPTIONS_V1_VERSION,
} from '@reels/core/prompts/style-options.v1'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

// Proposes a content-safe sample scene + 4 distinct visual "looks" for a channel.
// Text-only LLM call (cheap/fast); the wizard falls back to the single derived stylePreset on failure.
const InputSchema = z.object({
  nicheDescription: z.string().trim().min(1).max(8000),
  toneConfig: ToneConfigSchema,
  worldBible: WorldBibleSchema,
  sampleScript: z.string().trim().max(4000).optional(),
})

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

  const c = parsed.data
  const { system, userMessage } = buildStyleOptionsPrompt({
    nicheDescription: c.nicheDescription,
    worldJson: JSON.stringify(c.worldBible),
    toneJson: JSON.stringify(c.toneConfig),
    ...(c.sampleScript ? { sampleScript: c.sampleScript } : {}),
  })

  try {
    const result = await llmCall({
      templateVersion: STYLE_OPTIONS_V1_VERSION,
      schema: StyleOptionsSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1500,
    })
    // Reached from Settings ("Customize look") as well as the wizard, and the Settings caller discarded
    // the cost entirely — so it lands in the ledger here, where both callers are covered.
    await recordSpendEvent({ userId: gate.id, surface: 'channel_style_options', provider: 'openai', costCents: result.costCents })
    return NextResponse.json({
      sampleScene: result.data.sampleScene,
      styles: result.data.styles,
      costCents: result.costCents,
    })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, surface: 'channel_style_options', provider: 'openai' })
    console.error('[channel/style-options] failed:', err)
    return NextResponse.json({ error: 'Style proposal failed' }, { status: 502 })
  }
}
