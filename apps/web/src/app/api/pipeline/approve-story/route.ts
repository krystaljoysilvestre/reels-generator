import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { enqueueStep } from '@reels/queue'
import { requireReelOwner } from '@/lib/api-access'

export async function POST(req: NextRequest) {
  const { reelId, opMinutes } = (await req.json().catch(() => ({}))) as { reelId?: string; opMinutes?: number }
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Slice-1 guard: Evidence-Based Narrative reels prove the fidelity chain to story_review only. The
  // rendering path is still the photoreal image pipeline, which the EBN visual guardrail forbids for
  // reconstructions — so an EBN reel must NOT advance into it until the illustrative rendering profile
  // ships (Slice 2). Keep the story in review with a clear message rather than rendering it wrongly.
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId), columns: { storyMode: true } })
  if (channel?.storyMode === 'ebn') {
    return NextResponse.json(
      { error: 'Evidence-Based stories stop at review for now — illustrative rendering is the next slice. The reviewed story and its Evidence Bible are saved.' },
      { status: 409 },
    )
  }

  // Only a story under review can be approved — return 409 (not an opaque 500) on a stale/double submit.
  try {
    transition(reel.status, 'storyboard')
  } catch {
    return NextResponse.json({ error: `Cannot approve a reel in '${reel.status}'` }, { status: 409 })
  }

  await db.update(reels)
    .set({
      status: 'storyboard',
      operatorMinutes: opMinutes ?? reel.operatorMinutes,
      updatedAt: new Date(),
    })
    .where(eq(reels.id, reelId))

  // Build the Story Bible → scene breakdown → image generation; the chain STOPS at the storyboard gate
  // so the operator can edit scenes, pick a voice, and trigger the render.
  await enqueueStep({ reelId, stepName: 'analyze_story' })

  return NextResponse.json({ ok: true })
}
