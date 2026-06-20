import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { enqueueStep } from '@reels/queue'
import { getSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { channelId } = (await req.json().catch(() => ({}))) as { channelId?: string }
  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 })

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const [reel] = await db.insert(reels).values({
    channelId: channel.id,
    status: 'drafting',
    language,
  }).returning()

  // Kick off the pipeline: generate_story runs, then the chain STOPS at the story_review gate
  // (operator approves the story before scenes/images are generated).
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })

  return NextResponse.json({ reelId: reel!.id })
}
