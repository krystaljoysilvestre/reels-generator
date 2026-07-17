import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { ToneConfigSchema, WorldBibleSchema, TargetPlatformSchema, PLATFORM_PRESETS, MAX_TARGET_SECONDS } from '@reels/core'
import {
  buildChannelSamplePrompt,
  ChannelSampleSchema,
  CHANNEL_SAMPLE_V2_VERSION,
} from '@reels/core/prompts/channel-sample.v2'
import { getSession } from '@/lib/auth'

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
  genreCategory: z.string().trim().optional(), // derived bucket → picks the writer identity (niche keywords as fallback)
  narrativeStyle: z.string().trim().optional(), // prose style (story-styles); resolves within genre or falls back
  narrativeVoice: z.string().trim().optional(), // prose narrator voice (story-voices)
  styleInfluence: z.enum(['light', 'medium', 'full']).optional(),
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_SAMPLE_V2_VERSION,
      schema: ChannelSampleSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 1500,
    })
    return NextResponse.json({ sample: result.data, costCents: result.costCents })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sample generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
