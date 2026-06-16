import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import {
  buildChannelDerivationPrompt,
  ChannelDerivationSchema,
  CHANNEL_V1_VERSION,
} from '@reels/core/prompts/channel.v1'
import { getSession } from '@/lib/auth'

const InputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  nicheDescription: z.string().trim().min(20).max(2000),
  languages: z.array(z.string().trim().min(1)).min(1).max(6),
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const { name, nicheDescription, languages } = parsed.data
  const { system, userMessage } = buildChannelDerivationPrompt({ name, nicheDescription, languages })

  try {
    const result = await llmCall({
      templateVersion: CHANNEL_V1_VERSION,
      schema: ChannelDerivationSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 2048,
    })
    return NextResponse.json({ derived: result.data, costCents: result.costCents })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Derivation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
