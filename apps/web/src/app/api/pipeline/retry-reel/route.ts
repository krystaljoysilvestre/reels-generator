import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, pipelineSteps } from '@reels/db'
import { and, desc, eq } from 'drizzle-orm'
import { enqueueStep } from '@reels/queue'
import { getSession } from '@/lib/auth'

// Recover a reel that hard-failed: re-enqueue the step that failed (its prior steps are cached, so
// they skip — no re-pay) and reset the reel to the in-progress status that step belongs to. The
// chain resumes from there. enqueueStep clears the stale failed job so the re-run actually fires.
const STEP_RESET_STATUS: Record<string, string> = {
  generate_story: 'drafting',
  analyze_story: 'storyboard',
  generate_post_meta: 'storyboard',
  breakdown_scenes: 'storyboard',
  generate_images: 'storyboard',
  generate_tts: 'rendering',
  annotate_audio_script: 'rendering',
  compute_timings: 'rendering',
  generate_sfx: 'rendering',
  animate_scenes: 'rendering',
  mix_audio: 'rendering',
  render: 'rendering',
  render_qa: 'rendering',
}

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId } = (await req.json().catch(() => ({}))) as { reelId: string }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The step that stopped the chain (most recent failed step for this reel).
  const failed = await db.query.pipelineSteps.findFirst({
    where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.status, 'failed')),
    orderBy: [desc(pipelineSteps.startedAt)],
  })
  if (!failed) return NextResponse.json({ error: 'No failed step to retry' }, { status: 400 })

  const resetStatus = STEP_RESET_STATUS[failed.stepName] ?? 'rendering'
  await db.update(reels).set({ status: resetStatus as never, updatedAt: new Date() }).where(eq(reels.id, reelId))

  await enqueueStep({
    reelId,
    stepName: failed.stepName,
    // generate_story needs the channel + language to (re)derive the story.
    ...(failed.stepName === 'generate_story' ? { channelId: reel.channelId, language: reel.language } : {}),
  })

  return NextResponse.json({ ok: true, retriedStep: failed.stepName })
}
