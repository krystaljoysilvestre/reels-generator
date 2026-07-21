import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { inArray } from 'drizzle-orm'
import { getDb, compilations, reels } from '@reels/db'
import { getCurrentUser } from '@/lib/auth'
import { userOwnsChannel } from '@/lib/access'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelIds, theme, title } = (await req.json().catch(() => ({}))) as {
    reelIds: string[]
    theme?: string
    title?: string
  }

  if (!reelIds || reelIds.length < 2 || reelIds.length > 5) {
    return NextResponse.json({ error: 'Provide 2–5 reel IDs' }, { status: 400 })
  }

  const db = getDb()
  // Derive the channel from the reels (was: `channels.findFirst()` with no filter — a single-operator
  // relic that grabbed a random channel). All reels must belong to one channel the caller owns.
  const reelRows = await db.query.reels.findMany({
    where: inArray(reels.id, reelIds),
    columns: { id: true, channelId: true },
  })
  if (reelRows.length !== reelIds.length) {
    return NextResponse.json({ error: 'Some reels were not found' }, { status: 400 })
  }
  const channelIds = [...new Set(reelRows.map((r) => r.channelId))]
  if (channelIds.length !== 1) {
    return NextResponse.json({ error: 'All reels must belong to the same channel' }, { status: 400 })
  }
  const channelId = channelIds[0]!
  if (!(await userOwnsChannel(user, channelId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [compilation] = await db.insert(compilations).values({
    channelId,
    title: title ?? `Compilation — ${new Date().toLocaleDateString()}`,
    theme: theme ?? 'horror encounters',
    reelIds,
    status: 'drafting',
  }).returning()

  return NextResponse.json({ compilationId: compilation!.id })
}
