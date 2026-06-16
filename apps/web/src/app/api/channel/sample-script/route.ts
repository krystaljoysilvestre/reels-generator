import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { ToneConfigSchema, WorldBibleSchema } from '@reels/core'
import {
  buildChannelSamplePrompt,
  ChannelSampleSchema,
  CHANNEL_SAMPLE_V1_VERSION,
} from '@reels/core/prompts/channel-sample.v1'
import { getSession } from '@/lib/auth'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nicheDescription: z.string().trim().min(1).max(2000),
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
  toneConfig: ToneConfigSchema,
  worldBible: WorldBibleSchema,
  voiceStyle: z.string().trim().optional(),
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
    ...(c.voiceStyle ? { voiceStyle: c.voiceStyle } : {}),
  })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_SAMPLE_V1_VERSION,
      schema: ChannelSampleSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 900,
    })
    return NextResponse.json({ sample: result.data, costCents: result.costCents })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Sample generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
