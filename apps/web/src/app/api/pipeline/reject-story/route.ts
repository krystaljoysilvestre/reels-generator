import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels, rejections } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { getSession } from '@/lib/auth'
import type { rejectionReasonEnum } from '@reels/db'

type ReasonCode = (typeof rejectionReasonEnum.enumValues)[number]

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, reasonCode, note, opMinutes } = (await req.json().catch(() => ({}))) as {
    reelId?: string
    reasonCode?: ReasonCode
    note?: string
    opMinutes?: number
  }
  if (!reelId || !reasonCode) {
    return NextResponse.json({ error: 'reelId and reasonCode are required' }, { status: 400 })
  }

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only a story under review can be rejected — return 409 (not an opaque 500) on a stale/double submit.
  try {
    transition(reel.status, 'rejected')
  } catch {
    return NextResponse.json({ error: `Cannot reject a reel in '${reel.status}'` }, { status: 409 })
  }

  await db.transaction(async (tx) => {
    await tx.update(reels).set({
      status: 'rejected',
      operatorMinutes: opMinutes ?? reel.operatorMinutes,
      updatedAt: new Date(),
    }).where(eq(reels.id, reelId))

    await tx.insert(rejections).values({
      reelId,
      reasonCode,
      note: note ?? null,
    })
  })

  return NextResponse.json({ ok: true })
}
