import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, stories } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { getSession } from '@/lib/auth'

// Operator signs off on the rendered reel at the spot-check gate → 'approved'.
// (transition() throws unless the reel is actually in spot_check — never silently accept bad state.)
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, opMinutes } = (await req.json()) as { reelId: string; opMinutes?: number }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  transition(reel.status, 'approved')

  await db.update(reels).set({
    status: 'approved',
    operatorMinutes: opMinutes ?? reel.operatorMinutes,
    updatedAt: new Date(),
  }).where(eq(reels.id, reelId))

  // Compound the channel's voice DNA: an approved reel's story joins the few-shot reference set, so
  // every future reel is written against the channel's own best work. [Step 2]
  if (reel.storyId) {
    await db.update(stories).set({ isReference: true }).where(eq(stories.id, reel.storyId))
  }

  return NextResponse.json({ ok: true })
}
