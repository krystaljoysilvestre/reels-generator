import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import { GenreCategorySchema, SourcePolicySchema, resolveChannelPolicy, requiresEvidence, ToneConfigSchema, WorldBibleSchema, TargetPlatformsSchema, resolvePlatformPreset, MAX_TARGET_SECONDS } from '@reels/core'
import {
  buildChannelSamplePrompt,
  ChannelSampleSchema,
  CHANNEL_SAMPLE_V2_VERSION,
} from '@reels/core/prompts/channel-sample.v2'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'
import { defaultAudienceDescriptor } from '@reels/core/prompts/story-craft.v1'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nicheDescription: z.string().trim().min(1).max(8000),
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
  toneConfig: ToneConfigSchema,
  worldBible: WorldBibleSchema,
  // Ceiling = the largest platform cap (long-form YouTube runs minutes); clamped per-platform below.
  targetSeconds: z.number().int().min(15).max(MAX_TARGET_SECONDS).default(75),
  voiceStyle: z.string().trim().optional(),
  targetPlatforms: TargetPlatformsSchema,
  promptHint: z.string().trim().max(8000).optional(), // optional operator steer — can be a long, detailed brief
  // The operator's OWN draft, to be rebuilt in the channel's voice. Capped like the other free-text
  // fields since it is echoed into the prompt. Only ever their words — never a sample we wrote.
  reviseDraft: z.string().trim().max(8000).optional(),
  sourcePolicy: SourcePolicySchema.optional(),
  sourceMaterial: z.string().trim().max(20000).optional(),
  editorialPrinciples: z.string().trim().max(4000).optional(),
  genreCategory: GenreCategorySchema.optional(), // exact creator label; only absent legacy values use niche fallback
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
  const sourcePolicy = resolveChannelPolicy(null, null, { sourcePolicy: c.sourcePolicy })
  if (requiresEvidence(sourcePolicy) && !c.sourceMaterial) {
    return NextResponse.json({ error: 'Add sources for this example, or paste your own script.' }, { status: 400 })
  }
  const { system, userMessage } = buildChannelSamplePrompt({
    name: c.name,
    sourcePolicy,
    ...(c.sourceMaterial ? { sourceMaterial: c.sourceMaterial } : {}),
    ...(c.editorialPrinciples ? { editorialPrinciples: c.editorialPrinciples } : {}),
    creativeContext: {
      genre: c.genreCategory ?? '',
      niche: c.nicheDescription,
      language: c.languages[0]!,
      audienceDescriptor: defaultAudienceDescriptor(c.languages[0]!),
      targetSeconds: c.targetSeconds,
      narrativeStyle: c.narrativeStyle,
      narrativeVoice: c.narrativeVoice,
      styleInfluence: c.styleInfluence,
      editorialPrinciples: c.editorialPrinciples,
      sourcePolicy,
    },
    nicheDescription: c.nicheDescription,
    language: c.languages[0]!,
    toneJson: JSON.stringify(c.toneConfig),
    worldJson: JSON.stringify(c.worldBible),
    targetSeconds: c.targetSeconds,
    hookHint: resolvePlatformPreset(c.targetPlatforms).hookHint,
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
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, surface: 'channel_sample_script', provider: 'openai' })
    console.error('[channel/sample-script] failed:', err)
    return NextResponse.json({ error: 'Sample generation failed' }, { status: 502 })
  }
}
