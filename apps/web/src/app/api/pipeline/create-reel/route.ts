import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { enqueueStep } from '@reels/queue'
import { getCurrentUser } from '@/lib/auth'
import { userOwnsChannel } from '@/lib/access'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { channelId, generationMode, seed } = (await req.json().catch(() => ({}))) as {
    channelId?: string
    generationMode?: string
    seed?: string
  }
  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 })

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  if (!(await userOwnsChannel(user, channelId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // First reel sets how this channel produces reels — 'review' (stop at the human gates) or 'auto'
  // (run end-to-end to a finished render). Persisted on the channel; the worker reads it per gate.
  if (generationMode === 'auto' || generationMode === 'review') {
    await db.update(channels).set({ generationMode, updatedAt: new Date() }).where(eq(channels.id, channelId))
  }

  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const [reel] = await db.insert(reels).values({
    channelId: channel.id,
    status: 'drafting',
    language,
    // Optional topic request ("make one about …") — the story planner honors it for this reel only.
    ...(typeof seed === 'string' && seed.trim() ? { seedIdea: seed.trim().slice(0, 500) } : {}),
  }).returning()

  // Kick off the pipeline: generate_story runs, then the chain STOPS at the story_review gate
  // (operator approves the story before scenes/images are generated).
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })

  return NextResponse.json({ reelId: reel!.id })
}
