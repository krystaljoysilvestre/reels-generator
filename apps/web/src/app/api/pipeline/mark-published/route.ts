import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { transition } from '@reels/core'
import { getSession } from '@/lib/auth'

// Operator has posted the exported package to the platform(s) → 'published' (terminal).
// Phase 1 posting is manual (export-post-package zip), so this is the operator confirming the upload.
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId } = (await req.json()) as { reelId: string }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  transition(reel.status, 'published')  // allowed from approved/scheduled only

  await db.update(reels).set({
    status: 'published',
    updatedAt: new Date(),
  }).where(eq(reels.id, reelId))

  return NextResponse.json({ ok: true })
}
