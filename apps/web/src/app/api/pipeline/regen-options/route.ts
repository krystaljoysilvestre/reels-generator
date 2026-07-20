import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, scenes, assets, reels } from '@reels/db'
import { eq, and, sql } from 'drizzle-orm'
import { downloadBuffer, llmCall } from '@reels/providers'
import { buildGroundedFeedbackPrompt, GroundedFeedbackSchema, GROUNDED_FEEDBACK_V1_VERSION } from '@reels/core/prompts/grounded-feedback.v1'
import { getSession } from '@/lib/auth'

// AI-grounded feedback for the regenerate flow: when the operator attaches a reference (📎), a vision model
// reads the CURRENT scene image + the attachment and returns a few concrete, image-grounded ways to use it
// (the UI adds an "Other…" free-text option). Each option carries an `anchor` the regen route honours, so
// picking an option sets how strongly the reference leads — the operator never touches the mechanism.
//
// Only called when a reference is attached (opt-in, operator-initiated) — never on a plain regenerate or on
// the automated pipeline. Fails soft: any error returns empty options so the operator can still regenerate.

// Runs on the same cheap Haiku vision model the image-QA path uses — it produced solid, image-grounded
// options in testing, is verified callable, and this fires rarely (only when a reference is attached).
// A sharper model (claude-sonnet-4-6, also priced in the LLM client's table) is a one-line bump if the
// options ever feel too shallow.
const GROUNDED_FEEDBACK_MODEL = 'claude-haiku-4-5-20251001'

function sniffMediaType(buf: Buffer): 'image/webp' | 'image/jpeg' | 'image/png' {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  return 'image/jpeg'
}

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, sceneIdx, referenceKey } = (await req.json().catch(() => ({}))) as {
    reelId?: string; sceneIdx?: number; referenceKey?: string
  }
  if (!reelId || sceneIdx == null || !referenceKey) {
    return NextResponse.json({ error: 'reelId, sceneIdx and referenceKey are required' }, { status: 400 })
  }

  const db = getDb()
  const scene = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })
  if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })

  // Need the current scene image to compare against the attachment. No image yet → no grounded options;
  // the UI falls back to a plain attach-and-regenerate.
  if (!scene.imageAssetId) return NextResponse.json({ options: [] })
  const currentAsset = await db.query.assets.findFirst({ where: eq(assets.id, scene.imageAssetId) })
  if (!currentAsset) return NextResponse.json({ options: [] })

  try {
    const [curBuf, refBuf] = await Promise.all([downloadBuffer(currentAsset.storageKey), downloadBuffer(referenceKey)])
    const { system, userMessage } = buildGroundedFeedbackPrompt()
    const r = await llmCall({
      templateVersion: GROUNDED_FEEDBACK_V1_VERSION,
      schema: GroundedFeedbackSchema,
      provider: 'anthropic',
      model: GROUNDED_FEEDBACK_MODEL,
      system,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', mediaType: sniffMediaType(curBuf), base64: curBuf.toString('base64') },
            { type: 'image', mediaType: sniffMediaType(refBuf), base64: refBuf.toString('base64') },
            { type: 'text', text: userMessage },
          ],
        },
      ],
    })

    // Account the small vision cost against the reel (per the api-cost-accounting rule).
    if (r.costCents) {
      await db.update(reels).set({ costCents: sql`${reels.costCents} + ${r.costCents}`, updatedAt: new Date() }).where(eq(reels.id, reelId))
    }

    return NextResponse.json({ observation: r.data.observation ?? null, options: r.data.options })
  } catch {
    // Fail soft — the operator can still apply the change without the assist.
    return NextResponse.json({ options: [] })
  }
}
