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

  const { reelId, reasonCode, note, opMinutes } = (await req.json()) as {
    reelId: string
    reasonCode: ReasonCode
    note?: string
    opMinutes?: number
  }

  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  transition(reel.status, 'rejected')

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
