import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { listVoices, llmCall } from '@reels/providers'
import { ToneConfigSchema } from '@reels/core'
import {
  buildVoiceRecommendPrompt,
  VoiceRecommendationSchema,
  VOICE_RECOMMEND_V1_VERSION,
} from '@reels/core/prompts/voice-recommend.v1'
import { getSession } from '@/lib/auth'

const InputSchema = z.object({
  nicheDescription: z.string().trim().min(1).max(2000),
  language: z.string().trim().min(1),
  toneConfig: ToneConfigSchema,
  searchKeyword: z.string().trim().max(40).optional(),
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const catalog = await listVoices(
      parsed.data.language,
      parsed.data.searchKeyword ? { search: parsed.data.searchKeyword } : undefined,
    )
    const { system, userMessage } = buildVoiceRecommendPrompt({
      nicheDescription: parsed.data.nicheDescription,
      language: parsed.data.language,
      toneJson: JSON.stringify(parsed.data.toneConfig),
      catalog: catalog.map((v) => ({ id: v.id, name: v.name, gender: v.gender, accent: v.accent, description: v.description })),
    })
    const result = await llmCall({
      templateVersion: VOICE_RECOMMEND_V1_VERSION,
      schema: VoiceRecommendationSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 600,
    })

    // Map recommended ids → full voice objects (with previewUrl); drop unknown ids.
    const byId = new Map(catalog.map((v) => [v.id, v]))
    const recommended = result.data.recommendations
      .map((r) => {
        const v = byId.get(r.id)
        return v ? { ...v, reason: r.reason } : null
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)

    // Fallback: if the model returned nothing usable, surface the first few voices.
    const voices = recommended.length > 0 ? recommended : catalog.slice(0, 4).map((v) => ({ ...v, reason: '' }))
    return NextResponse.json({ voices, costCents: result.costCents })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recommendation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
