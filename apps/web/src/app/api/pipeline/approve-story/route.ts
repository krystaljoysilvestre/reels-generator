import { NextRequest, NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, opMinutes } = (await req.json()) as { reelId: string; opMinutes?: number }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  transition(reel.status, 'storyboard')  // throws if wrong state

  await db.update(reels)
    .set({
      status: 'storyboard',
      operatorMinutes: opMinutes ?? reel.operatorMinutes,
      updatedAt: new Date(),
    })
    .where(eq(reels.id, reelId))

  // Enqueue downstream pipeline steps (annotate_audio_script → breakdown_scenes → etc.)
  // Worker picks up via BullMQ; for Phase 1 the operator can also trigger manually from storyboard

  return NextResponse.json({ ok: true })
}
