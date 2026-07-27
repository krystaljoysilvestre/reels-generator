import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  generateImage,
  assembleImagePrompt,
  assembleNegativePrompt,
  ContentFilterError,
  SCENE_IMAGE_QUALITY,
} from '@reels/providers'
import { recordSpendEvent } from '@reels/db'
import { requireApiUser, requireSpendBudget } from '@/lib/api-access'

// On-demand preview for ONE style option. Called only when the operator clicks "Preview" on a card.
// Not auto-retried — Retry on the card is the manual path.
const InputSchema = z.object({
  stylePreset: z.string().trim().min(1),
  sampleScene: z.string().trim().min(1).max(2000),
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

  const { stylePreset, sampleScene } = parsed.data
  const storageKey = `style-options/${randomUUID()}/img.webp`

  try {
    const result = await generateImage({
      prompt: assembleImagePrompt(sampleScene, stylePreset),
      negativePrompt: assembleNegativePrompt(),
      storageKey,
      reelId: 'style-options',
      sceneIdx: 0,
      // Render the preview with the EXACT shared scene recipe (model + quality) so the look the operator
      // approves here is the look their scenes actually get.
      quality: SCENE_IMAGE_QUALITY,
    })
    // Same route serves the wizard and Settings; the Settings caller dropped the cost. One gpt-image-1
    // render at scene quality per preview, so a few "try another look" clicks is real money.
    await recordSpendEvent({ userId: gate.id, surface: 'channel_style_image', provider: 'openai', costCents: result.costCents })
    return NextResponse.json({ imageKey: result.asset.storageKey, costCents: result.costCents })
  } catch (err) {
    if (err instanceof ContentFilterError) {
      return NextResponse.json(
        { error: 'This look got flagged by the image filter.', kind: 'filtered' },
        { status: 422 },
      )
    }
    const message = err instanceof Error ? err.message : 'Preview failed'
    return NextResponse.json({ error: message, kind: 'transient' }, { status: 502 })
  }
}
