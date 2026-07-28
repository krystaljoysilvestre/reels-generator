import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { listVoices, llmCall, ProviderRateLimitError } from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import { ToneConfigSchema } from '@reels/core'
import {
  buildVoiceRecommendPrompt,
  VoiceRecommendationSchema,
  VOICE_RECOMMEND_V1_VERSION,
} from '@reels/core/prompts/voice-recommend.v1'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'

const InputSchema = z.object({
  nicheDescription: z.string().trim().min(1).max(8000),
  // Capped like the other free-text fields: this string is echoed into the prompt, so an
  // unbounded one is a token-cost vector. Every supported language name is well under 40.
  language: z.string().trim().min(1).max(40),
  toneConfig: ToneConfigSchema,
  searchKeyword: z.string().trim().max(40).optional(),
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

  try {
    // The genre keyword narrows hard in most languages — Italian/Japanese/Korean + "horror" return a
    // SINGLE in-language voice, so recommending from that slice alone means the model rubber-stamps
    // the only option it was shown. Pool the genre-branded voices with the rest of the language's
    // catalog (branded first, so they still win ties) and let the model choose from a real field.
    // Everything here is in-language: a thin genre must never become a wrong-language narrator.
    const [keyed, broad] = await Promise.all([
      listVoices(parsed.data.language, parsed.data.searchKeyword ? { search: parsed.data.searchKeyword } : undefined),
      // Degrades to the keyword slice alone rather than failing the request — but say so, otherwise a
      // systematically failing widen looks identical to a language that's genuinely thin.
      parsed.data.searchKeyword
        ? listVoices(parsed.data.language).catch((err: unknown) => {
            console.warn(`[voices] widen past keyword failed for ${parsed.data.language}:`, err)
            return []
          })
        : Promise.resolve([]),
    ])
    const pool: typeof keyed = []
    const poolIds = new Set<string>()
    for (const v of [...keyed, ...broad]) {
      if (v.id && !poolIds.has(v.id)) { poolIds.add(v.id); pool.push(v) }
    }
    // Cap what the model reads so a wider pool doesn't grow the prompt without bound.
    const catalog = pool.slice(0, 40)
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
    // Recorded here rather than by the callers: both of them (the wizard, and the storyboard's voice
    // picker) threw the cost away, and the route has no reel/channel id to bill.
    await recordSpendEvent({ userId: gate.id, surface: 'voice_recommend', provider: 'openai', costCents: result.costCents })

    // Map recommended ids → full voice objects (with previewUrl); drop unknown ids.
    const byId = new Map(catalog.map((v) => [v.id, v]))
    const recommended = result.data.recommendations
      .map((r) => {
        const v = byId.get(r.id)
        return v ? { ...v, reason: r.reason } : null
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)

    // Don't hand the operator only the model's few picks — return the WHOLE browsable pool, with the
    // recommended ones surfaced first (and their reasons). `pool` already spans the genre keyword plus
    // the rest of the language's catalog, so this browses wider than the 40 the model was shown.
    const seen = new Set(recommended.map((v) => v.id))
    const rest: Array<(typeof pool)[number] & { reason: string }> = []
    for (const v of pool) {
      if (v.id && !seen.has(v.id)) {
        seen.add(v.id)
        rest.push({ ...v, reason: '' })
      }
    }
    const voices = [...recommended, ...rest]
    return NextResponse.json({ voices, costCents: result.costCents })
  } catch (err) {
    // The client only ever sees a generic message, so without this the failure leaves no trace at all.
    console.error('[voices] recommend failed:', err)
    // A rate limit is worth a calm retry; otherwise return a generic message (don't leak provider internals).
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — give it a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Could not load voices — try again.' }, { status: 502 })
  }
}
