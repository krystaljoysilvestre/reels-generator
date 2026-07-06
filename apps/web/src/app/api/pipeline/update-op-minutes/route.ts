import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { reelId, opMinutes } = (await req.json().catch(() => ({}))) as { reelId: string; opMinutes: number }
  const db = getDb()
  await db.update(reels).set({ operatorMinutes: opMinutes, updatedAt: new Date() }).where(eq(reels.id, reelId))
  return NextResponse.json({ ok: true })
}
