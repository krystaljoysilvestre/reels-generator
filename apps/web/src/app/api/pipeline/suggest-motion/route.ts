import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, scenes, channels, assets } from '@reels/db'
import { eq, and, inArray, sql } from 'drizzle-orm'
import { llmCall, ProviderRateLimitError } from '@reels/providers'
import { animatorMotionPrompt } from '@reels/core'
import { buildSuggestMotionPrompt, SuggestMotionSchema, MOTION_V1_VERSION } from '@reels/core/prompts/motion.v1'
import { requireReelOwner, requireSpendBudget } from '@/lib/api-access'
import { recordFailedSpend } from '@/lib/failed-spend'

// Translate an operator's plain-language motion request into a scene's animation instruction (motion.v1),
// then arm the scene for (re)animation: mark it video tier and drop any stale clip so the next preview or
// render animates the CURRENT image with the new motion. Never touches the image itself — this is the
// motion analog of the reshoot/revise flow. (This is the productized version of hand-editing motionPrompt.)
export async function POST(req: NextRequest) {
  const { reelId, sceneIdx, request: motionRequest } = (await req.json().catch(() => ({}))) as {
    reelId?: string
    sceneIdx?: number
    request?: string
  }
  if (!reelId || sceneIdx == null) return NextResponse.json({ error: 'reelId and sceneIdx are required' }, { status: 400 })
  if (!motionRequest?.trim()) return NextResponse.json({ error: 'Describe how the shot should move.' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate
  const budgetGate = await requireSpendBudget(gate)
  if (budgetGate) return budgetGate

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Reel not found' }, { status: 404 })
  const scene = await db.query.scenes.findFirst({ where: and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)) })
  if (!scene) return NextResponse.json({ error: 'Scene not found' }, { status: 404 })
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })

  try {
    const { system, userMessage } = buildSuggestMotionPrompt(scene.visualPrompt ?? '', motionRequest.trim(), {
      ...(channel?.genreCategory ? { genreCategory: channel.genreCategory } : {}),
      ...(scene.motionPrompt ? { currentMotion: scene.motionPrompt } : {}),
    })
    const { data, costCents } = await llmCall({
      templateVersion: MOTION_V1_VERSION,
      schema: SuggestMotionSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 300,
    })

    // Bill before the bookkeeping writes below: those can throw, and the catch turns any failure into a 502
    // that would drop an already-paid call from every spend total and budget gate.
    if (costCents > 0) {
      await db.update(reels).set({ costCents: sql`${reels.costCents} + ${costCents}`, updatedAt: new Date() }).where(eq(reels.id, reelId))
    }

    const motionPrompt = animatorMotionPrompt(data.cameraMove, data.subjectMotion)

    // Arm for (re)animation from the CURRENT image: video tier + drop the stale clip so animate regenerates.
    await db.update(scenes).set({ motionPrompt, tier: 'video' }).where(and(eq(scenes.reelId, reelId), eq(scenes.idx, sceneIdx)))
    const reelClips = await db.query.assets.findMany({ where: and(eq(assets.reelId, reelId), eq(assets.kind, 'video')) })
    const staleIds = reelClips.filter((a) => (a.meta as Record<string, unknown>)['sceneIdx'] === sceneIdx).map((a) => a.id)
    if (staleIds.length) await db.delete(assets).where(inArray(assets.id, staleIds))

    return NextResponse.json({ ok: true, motionPrompt, subjectMotion: data.subjectMotion, cameraMove: data.cameraMove })
  } catch (err) {
    // The call may have paid for one or more provider requests before failing — bill those, don't lose them.
    await recordFailedSpend(err, { kind: 'reel', reelId })
    if (err instanceof ProviderRateLimitError) return NextResponse.json({ error: 'Busy right now — try again in a moment.' }, { status: 429 })
    return NextResponse.json({ error: 'Could not translate that motion — try rephrasing.' }, { status: 502 })
  }
}
