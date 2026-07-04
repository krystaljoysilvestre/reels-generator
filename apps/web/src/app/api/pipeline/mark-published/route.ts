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

  const { reelId } = (await req.json().catch(() => ({}))) as { reelId?: string }
  if (!reelId) return NextResponse.json({ error: 'reelId is required' }, { status: 400 })
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Publishing is allowed only from approved/scheduled — return 409 (not an opaque 500) otherwise.
  try {
    transition(reel.status, 'published')
  } catch {
    return NextResponse.json({ error: `Cannot publish a reel in '${reel.status}'` }, { status: 409 })
  }

  await db.update(reels).set({
    status: 'published',
    updatedAt: new Date(),
  }).where(eq(reels.id, reelId))

  return NextResponse.json({ ok: true })
}
