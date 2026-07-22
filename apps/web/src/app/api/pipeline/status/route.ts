import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { getDb, reels, pipelineSteps, scenes } from '@reels/db'
import { baseStepName } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'

// Lightweight poll endpoint powering the live "what's going on" UX (story loading + render progress).
// GET ?reelId=...[&scenes=1] → reel status + per-step status + (optionally) per-scene image readiness.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const reelId = url.searchParams.get('reelId')
  if (!reelId) return NextResponse.json({ error: 'reelId required' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const withScenes = url.searchParams.get('scenes') === '1'

  const db = getDb()
  const reel = await db.query.reels.findFirst({
    where: eq(reels.id, reelId),
    columns: { status: true, storyId: true, costCents: true },
  })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const rawSteps = await db.query.pipelineSteps.findMany({
    where: eq(pipelineSteps.reelId, reelId),
    columns: { stepName: true, status: true, attempt: true },
  })

  // Fan-out steps (generate_images / animate_scenes) write one row PER scene ('generate_images:scene3').
  // Collapse them to their base step so the UI shows a single entry per pipeline step. Aggregate status
  // by "most active" across the sub-units: running > failed > pending > done (so a step reads 'done' only
  // when every sub-unit is done, and surfaces a failure the moment any sub-unit fails). Max attempt wins.
  const rank = (s: string) => (s === 'running' ? 3 : s === 'failed' ? 2 : s === 'pending' ? 1 : 0)
  const byBase = new Map<string, { status: string; attempt: number }>()
  for (const s of rawSteps) {
    const base = baseStepName(s.stepName)
    const cur = byBase.get(base)
    const attempt = Math.max(cur?.attempt ?? 0, s.attempt ?? 0)
    if (!cur || rank(s.status) > rank(cur.status)) byBase.set(base, { status: s.status, attempt })
    else cur.attempt = attempt
  }
  const steps = [...byBase.entries()].map(([stepName, a]) => ({ stepName, status: a.status }))
  const failed = steps.find((s) => s.status === 'failed')
  const storyStep = byBase.get('generate_story')

  const out: Record<string, unknown> = {
    reelStatus: reel.status,
    costCents: reel.costCents,
    storyId: reel.storyId,
    steps,
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
    // step row but per-scene assets). imageAssetId rides along so the client can detect not just a new
    // image landing but an existing one being REPLACED (reshoot / re-render): the id changes, the count
    // doesn't — a hasImage-only signal would miss it and the swapped image wouldn't auto-appear.
    out.scenes = sceneRows
      .sort((a, b) => a.idx - b.idx)
      .map((s) => ({ idx: s.idx, hasImage: !!s.imageAssetId, imageAssetId: s.imageAssetId }))
  }

  return NextResponse.json(out)
}
