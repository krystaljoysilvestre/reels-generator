import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, reels, pipelineSteps, scenes } from '@reels/db'
import { getSession } from '@/lib/auth'

// Lightweight poll endpoint powering the live "what's going on" UX (story loading + render progress).
// GET ?reelId=...[&scenes=1] → reel status + per-step status + (optionally) per-scene image readiness.
export async function GET(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const reelId = url.searchParams.get('reelId')
  if (!reelId) return NextResponse.json({ error: 'reelId required' }, { status: 400 })
  const withScenes = url.searchParams.get('scenes') === '1'

  const db = getDb()
  const reel = await db.query.reels.findFirst({
    where: eq(reels.id, reelId),
    columns: { status: true, storyId: true, costCents: true },
  })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const steps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.reelId, reelId),
    columns: { stepName: true, status: true, attempt: true },
  })
  const failed = steps.find((s) => s.status === 'failed')
  const storyStep = steps.find((s) => s.stepName === 'generate_story')

  const out: Record<string, unknown> = {
    reelStatus: reel.status,
    costCents: reel.costCents,
    storyId: reel.storyId,
    steps: steps.map((s) => ({ stepName: s.stepName, status: s.status })),
    // generate_story substate (running vs failed) + attempt #, for the story-phase loader.
    step: storyStep ? { name: 'generate_story', status: storyStep.status, attempt: storyStep.attempt } : null,
    failedStep: failed?.stepName ?? null,
  }

  if (withScenes) {
    const sceneRows = await db.query.scenes.findMany({
      where: eq(scenes.reelId, reelId),
      columns: { idx: true, imageAssetId: true },
    })
    // Per-scene image readiness — the true source for "images develop in" (generate_images writes one
    // step row but per-scene assets).
    out.scenes = sceneRows
      .sort((a, b) => a.idx - b.idx)
      .map((s) => ({ idx: s.idx, hasImage: !!s.imageAssetId }))
  }

  return NextResponse.json(out)
}
