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
import { assets, getDb, recordSpendEvent } from '@reels/db'
import { requireApiUser, requireChannelOwner, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

// On-demand preview for ONE style option. Called only when the operator clicks "Preview" on a card.
// Not auto-retried — Retry on the card is the manual path.
const InputSchema = z.object({
  channelId: z.string().uuid(),
  stylePreset: z.string().trim().min(1),
  sampleScene: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest) {
  const apiGate = await requireApiUser()
  if (apiGate instanceof NextResponse) return apiGate

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }

  const gate = await requireChannelOwner(parsed.data.channelId)
  if (gate instanceof NextResponse) return gate
  // Paid call — respect the caller's monthly spend cap before spending (these routes were the gap:
  // setup, preview, and research spend ran with no budget gate at all).
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const { channelId, stylePreset, sampleScene } = parsed.data
  const storageKey = `channels/${channelId}/style-options/${randomUUID()}.webp`

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
    // The provider call has completed and is paid. Record it before the ownership-ledger write so a
    // transient DB failure there cannot erase real spend.
    await recordSpendEvent({ userId: gate.id, surface: 'channel_style_image', provider: 'openai', costCents: result.costCents })
    await getDb().insert(assets).values({
      channelId,
      kind: 'image',
      storageKey: result.asset.storageKey,
      provider: 'openai',
      costCents: 0,
      meta: { surface: 'channel_style_image', accountedBy: 'spend_events', providerCostCents: result.costCents },
    })
    // Same route serves the wizard and Settings. One gpt-image-1 render at scene quality per preview,
    // so a few "try another look" clicks is real money.
    console.log(`[audit] asset.generate actor=${gate.id} channel=${channelId} kind=style_image key=${result.asset.storageKey} costCents=${result.costCents}`)
    return NextResponse.json({ imageKey: result.asset.storageKey, costCents: result.costCents })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'event', userId: gate.id, surface: 'channel_style_image', provider: 'openai' })
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
