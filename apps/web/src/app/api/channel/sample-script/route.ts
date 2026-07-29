import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import { ToneConfigSchema, WorldBibleSchema, TargetPlatformSchema, PLATFORM_PRESETS, MAX_TARGET_SECONDS } from '@reels/core'
import {
  buildChannelSamplePrompt,
  ChannelSampleSchema,
  CHANNEL_SAMPLE_V2_VERSION,
} from '@reels/core/prompts/channel-sample.v2'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nicheDescription: z.string().trim().min(1).max(8000),
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
  toneConfig: ToneConfigSchema,
  worldBible: WorldBibleSchema,
  // Ceiling = the largest platform cap (long-form YouTube runs minutes); clamped per-platform below.
  targetSeconds: z.number().int().min(15).max(MAX_TARGET_SECONDS).default(75),
  voiceStyle: z.string().trim().optional(),
  targetPlatform: TargetPlatformSchema.default('all'),
  promptHint: z.string().trim().max(8000).optional(), // optional operator steer — can be a long, detailed brief
  // The operator's OWN draft, to be rebuilt in the channel's voice. Capped like the other free-text
  // fields since it is echoed into the prompt. Only ever their words — never a sample we wrote.
  reviseDraft: z.string().trim().max(8000).optional(),
  genreCategory: z.string().trim().optional(), // derived bucket → picks the writer identity (niche keywords as fallback)
  narrativeStyle: z.string().trim().optional(), // prose style (story-styles); resolves within genre or falls back
  narrativeVoice: z.string().trim().optional(), // prose narrator voice (story-voices)
  styleInfluence: z.enum(['light', 'medium', 'full']).optional(),
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
  const { system, userMessage } = buildChannelSamplePrompt({
    name: c.name,
    nicheDescription: c.nicheDescription,
    language: c.languages[0]!,
    toneJson: JSON.stringify(c.toneConfig),
    worldJson: JSON.stringify(c.worldBible),
    targetSeconds: c.targetSeconds,
    hookHint: PLATFORM_PRESETS[c.targetPlatform].hookHint,
    ...(c.genreCategory ? { genreCategory: c.genreCategory } : {}),
    ...(c.narrativeStyle ? { narrativeStyle: c.narrativeStyle } : {}),
    ...(c.narrativeVoice ? { narrativeVoice: c.narrativeVoice } : {}),
    ...(c.styleInfluence ? { styleInfluence: c.styleInfluence } : {}),
    ...(c.voiceStyle ? { voiceStyle: c.voiceStyle } : {}),
    ...(c.promptHint ? { promptHint: c.promptHint } : {}),
    ...(c.reviseDraft ? { reviseDraft: c.reviseDraft } : {}),
  })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_SAMPLE_V2_VERSION,
      schema: ChannelSampleSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1500,
    })
    await recordSpendEvent({ userId: gate.id, surface: 'channel_sample_script', provider: 'openai', costCents: result.costCents })
    return NextResponse.json({ sample: result.data, costCents: result.costCents })
  } catch (err) {
    console.error('[channel/sample-script] failed:', err)
    return NextResponse.json({ error: 'Sample generation failed' }, { status: 502 })
  }
}
