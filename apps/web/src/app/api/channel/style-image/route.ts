import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  generateImage,
  assembleImagePrompt,
  assembleNegativePrompt,
  FalEngineSchema,
  ContentFilterError,
  SCENE_IMAGE_MODEL_ID,
  SCENE_IMAGE_GUIDANCE,
  SCENE_IMAGE_STEPS,
} from '@reels/providers'
import { getSession } from '@/lib/auth'

// On-demand preview for ONE style option (~4¢ fal). Called only when the operator
// clicks "Preview" on a card. Not auto-retried — Retry on the card is the manual path.
const InputSchema = z.object({
  stylePreset: z.string().trim().min(1),
  sampleScene: z.string().trim().min(1).max(2000),
})

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
      // Render the preview with the EXACT scene recipe (model + guidance + steps) so the look the operator
      // approves here is the look their scenes actually get. Previously this ran hotter (guidance 4.5) and
      // oversold the stylization vs the 3.5 scenes. Shared constants keep the two from drifting again.
      engine: FalEngineSchema.parse({ imageModelId: SCENE_IMAGE_MODEL_ID }),
      guidanceScale: SCENE_IMAGE_GUIDANCE,
      numInferenceSteps: SCENE_IMAGE_STEPS,
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
