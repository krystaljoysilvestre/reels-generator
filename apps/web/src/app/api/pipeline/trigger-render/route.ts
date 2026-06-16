import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { getSession } from '@/lib/auth'

// Transitions the reel to 'rendering' and sets the voiceId.
// The worker picks up the pipeline from here via BullMQ.

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, voiceId } = (await req.json()) as { reelId: string; voiceId: string }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  transition(reel.status, 'rendering')

  await db.update(reels).set({
    status: 'rendering',
    voiceId,
    updatedAt: new Date(),
  }).where(eq(reels.id, reelId))

  // BullMQ worker watches for 'rendering' status and continues the pipeline

  return NextResponse.json({ ok: true })
}
