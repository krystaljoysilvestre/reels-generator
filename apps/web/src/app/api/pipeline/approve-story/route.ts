import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
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
