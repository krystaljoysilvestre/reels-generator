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
import { requireApiUser } from '@/lib/api-access'

// On-demand preview for ONE style option. Called only when the operator clicks "Preview" on a card.
// Not auto-retried — Retry on the card is the manual path.
const InputSchema = z.object({
  stylePreset: z.string().trim().min(1),
  sampleScene: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate

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
