import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { requireReelOwner } from '@/lib/api-access'

export async function POST(req: NextRequest) {
  const { reelId, opMinutes } = (await req.json().catch(() => ({}))) as { reelId: string; opMinutes: number }

  const gate = await requireReelOwner(reelId)
  if (gate instanceof NextResponse) return gate

  // operatorMinutes is a NOT NULL integer column — reject a non-numeric/negative value as a clean 400
  // instead of letting it become a DB error or polluting cost analytics.
  if (typeof opMinutes !== 'number' || !Number.isFinite(opMinutes) || opMinutes < 0) {
    return NextResponse.json({ error: 'opMinutes must be a non-negative number' }, { status: 400 })
  }

  const db = getDb()
  await db.update(reels).set({ operatorMinutes: Math.round(opMinutes), updatedAt: new Date() }).where(eq(reels.id, reelId))
  return NextResponse.json({ ok: true })
}
