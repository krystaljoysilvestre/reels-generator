import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, stories } from '@reels/db'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth'

// Flag/unflag a story as a voice reference. Reference stories are the few-shot pool the writer
// hears before every new story — one of the Writer's three ingredients (identity + craft +
// references, see story-writer-v2 pivot). Spot-check approval flags automatically; this gives the
// operator direct control (curate the best in, pull a stale one out).
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { storyId, isReference } = (await req.json().catch(() => ({}))) as {
    storyId?: string
    isReference?: boolean
  }
  if (!storyId || typeof isReference !== 'boolean') {
    return NextResponse.json({ error: 'storyId and isReference are required' }, { status: 400 })
  }

  const db = getDb()
  const [updated] = await db
    .update(stories)
    .set({ isReference })
    .where(eq(stories.id, storyId))
    .returning({ id: stories.id, isReference: stories.isReference })
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ ok: true, isReference: updated.isReference })
}
