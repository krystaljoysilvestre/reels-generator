import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, reels, channels, stories } from '@reels/db'
import { getSession } from '@/lib/auth'

const InputSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
  title: z.string().trim().max(120).optional(),
})

// BYO script: the operator provides their own story for this reel, so generate_story is skipped. Create
// the reel directly at the story_review gate, linked to a source='user' story. (Not a reference — only
// spot-check approval promotes a story into the few-shot set.)
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { channelId, body, title } = parsed.data

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()

  const firstLine = body.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Untitled'
  const storyTitle = (title || firstLine).slice(0, 120)

  // Insert the story first, then the reel already linked + at the gate — so a reel never exists at
  // story_review without its story.
  const [story] = await db
    .insert(stories)
    .values({ channelId: channel.id, source: 'user', language, title: storyTitle, body, isReference: false })
    .returning()
  const [reel] = await db
    .insert(reels)
    .values({ channelId: channel.id, status: 'story_review', language, storyId: story!.id })
    .returning()

  return NextResponse.json({ reelId: reel!.id })
}
