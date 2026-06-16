import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server'
import { getDb, compilations, channels } from '@reels/db'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelIds, theme, title } = (await req.json()) as {
    reelIds: string[]
    theme?: string
    title?: string
  }

  if (!reelIds || reelIds.length < 2 || reelIds.length > 5) {
    return NextResponse.json({ error: 'Provide 2–5 reel IDs' }, { status: 400 })
  }

  const db = getDb()
  const channel = await db.query.channels.findFirst()
  if (!channel) return NextResponse.json({ error: 'No channel' }, { status: 400 })

  const [compilation] = await db.insert(compilations).values({
    channelId: channel.id,
    title: title ?? `Compilation — ${new Date().toLocaleDateString()}`,
    theme: theme ?? 'horror encounters',
    reelIds,
    status: 'drafting',
  }).returning()

  // Queue the build job in BullMQ (worker picks it up)
  // For Phase 1 we return the compilationId and let the operator trigger via the worker directly
  return NextResponse.json({ compilationId: compilation!.id })
}
