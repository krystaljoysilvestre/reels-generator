import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels, rejections } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { requireReelOwner } from '@/lib/api-access'
import { rejectionReasonEnum } from '@reels/db'

type ReasonCode = (typeof rejectionReasonEnum.enumValues)[number]

export async function POST(req: NextRequest) {
  const { reelId, reasonCode, note, opMinutes } = (await req.json().catch(() => ({}))) as {
    reelId?: string
    reasonCode?: ReasonCode
    note?: string
    opMinutes?: number
  }
  if (!reelId || !reasonCode) {
    return NextResponse.json({ error: 'reelId and reasonCode are required' }, { status: 400 })
  }
  // reasonCode is written into a PG enum column — validate up front so a bad value is a clean 400, not a
  // 22P02 500. opMinutes lands in an integer column; keep only a non-negative integer.
  if (!rejectionReasonEnum.enumValues.includes(reasonCode)) {
    return NextResponse.json({ error: 'Invalid reasonCode' }, { status: 400 })
  }
  const cleanOpMinutes =
    typeof opMinutes === 'number' && Number.isFinite(opMinutes) && opMinutes >= 0 ? Math.round(opMinutes) : undefined

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

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
      operatorMinutes: cleanOpMinutes ?? reel.operatorMinutes,
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
