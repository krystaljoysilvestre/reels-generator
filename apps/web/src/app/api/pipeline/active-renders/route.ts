import { NextResponse } from 'next/server'
import { inArray, and, gt } from 'drizzle-orm'
import { getDb, reels, stories } from '@reels/db'
import { requireApiUser } from '@/lib/api-access'
import { accessibleChannelIds } from '@/lib/access'

// Powers the app-wide "reel is done" alert (RenderAlertWatcher). Returns reels currently rendering OR
// freshly rested in the last ~30 min, so a global watcher can spot the working → done transition on ANY
// page. Scoped to the caller's channels (admins see all). GET → { reels: [{ id, title, status }] }.
const TRACKED: Array<'rendering' | 'render_qa' | 'spot_check' | 'failed'> = ['rendering', 'render_qa', 'spot_check', 'failed']

export async function GET() {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate

  const db = getDb()
  const cutoff = new Date(Date.now() - 30 * 60_000)
  const ids = await accessibleChannelIds(user)
  const where = ids === null
    ? and(inArray(reels.status, TRACKED), gt(reels.updatedAt, cutoff))
    : and(inArray(reels.status, TRACKED), gt(reels.updatedAt, cutoff), inArray(reels.channelId, ids))
  const rows = await db.query.reels.findMany({
    where,
    columns: { id: true, status: true, storyId: true },
    limit: 50,
  })

  const storyIds = [...new Set(rows.map((r) => r.storyId).filter((x): x is string => !!x))]
  const titles = new Map<string, string>()
  if (storyIds.length) {
    const ss = await db.query.stories.findMany({
      where: inArray(stories.id, storyIds),
      columns: { id: true, title: true },
    })
    for (const s of ss) titles.set(s.id, s.title)
  }

  return NextResponse.json({
    reels: rows.map((r) => ({
      id: r.id,
      status: r.status,
      title: (r.storyId && titles.get(r.storyId)) || 'Your reel',
    })),
  })
}
