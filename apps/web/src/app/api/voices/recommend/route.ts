import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listVoices, llmCall, ProviderRateLimitError } from '@reels/providers'
import { ToneConfigSchema } from '@reels/core'
import {
  buildVoiceRecommendPrompt,
  VoiceRecommendationSchema,
  VOICE_RECOMMEND_V1_VERSION,
} from '@reels/core/prompts/voice-recommend.v1'
import { getSession } from '@/lib/auth'

const InputSchema = z.object({
  nicheDescription: z.string().trim().min(1).max(8000),
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

    // Don't hand the operator only the model's few picks — return the WHOLE browsable pool, with the
    // recommended ones surfaced first (and their reasons). Broaden past the genre keyword too (the
    // multilingual TTS narrates this language with any voice), so there are plenty to choose from.
    const broad = parsed.data.searchKeyword
      ? await listVoices(parsed.data.language).catch(() => [])
      : []
    const seen = new Set(recommended.map((v) => v.id))
    const rest: Array<(typeof catalog)[number] & { reason: string }> = []
    for (const v of [...catalog, ...broad]) {
      if (v.id && !seen.has(v.id)) {
        seen.add(v.id)
        rest.push({ ...v, reason: '' })
      }
    }
    const voices = [...recommended, ...rest]
    return NextResponse.json({ voices, costCents: result.costCents })
  } catch (err) {
    // A rate limit is worth a calm retry; otherwise return a generic message (don't leak provider internals).
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — give it a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Could not load voices — try again.' }, { status: 502 })
  }
}
