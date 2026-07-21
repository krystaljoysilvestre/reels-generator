import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { llmCall } from '@reels/providers'
import { WorldBibleSchema, ToneConfigSchema } from '@reels/core'
import {
  buildStyleOptionsPrompt,
  StyleOptionsSchema,
  STYLE_OPTIONS_V1_VERSION,
} from '@reels/core/prompts/style-options.v1'
import { requireApiUser } from '@/lib/api-access'

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
    return NextResponse.json({
      sampleScene: result.data.sampleScene,
      styles: result.data.styles,
      costCents: result.costCents,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Style proposal failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
