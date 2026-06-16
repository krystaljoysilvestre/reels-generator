import { NextResponse } from 'next/server'
import { getDb, reels, channels } from '@reels/db'
import { getSession } from '@/lib/auth'

export async function POST() {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getDb()
  const channel = await db.query.channels.findFirst()
  if (!channel) return NextResponse.json({ error: 'No channel configured' }, { status: 400 })

  const [reel] = await db.insert(reels).values({
    channelId: channel.id,
    status: 'drafting',
    language: 'tagalog',
  }).returning()

  // Enqueue generate_story job via BullMQ (worker handles it)
  // For Phase 1 operator flow, we also accept manually-created reels that start at storyboard
  return NextResponse.json({ reelId: reel!.id })
}
