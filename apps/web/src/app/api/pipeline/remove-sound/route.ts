import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { OperatorSfxSchema } from '@reels/core'
import { getSession } from '@/lib/auth'

// Remove one manual sound cue from the reel.
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, cueId } = (await req.json().catch(() => ({}))) as { reelId: string; cueId: string }
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Reel not found' }, { status: 404 })

  const cues = OperatorSfxSchema.parse(reel.operatorSfx ?? [])
  await db.update(reels).set({ operatorSfx: cues.filter((c) => c.id !== cueId), updatedAt: new Date() }).where(eq(reels.id, reelId))
  return NextResponse.json({ ok: true })
}
