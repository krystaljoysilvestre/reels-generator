import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, reels, channels, stories } from '@reels/db'
import { enqueueStep } from '@reels/queue'
import { requireChannelOwner } from '@/lib/api-access'

const InputSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
  title: z.string().trim().max(120).optional(),
})

// BYO script: the operator provides their own story for this reel, so generate_story is skipped. The user
// wrote it, so there's nothing to review — we DON'T stop at the story_review gate. Create the reel directly
// at 'storyboard' and kick off the build (analyze_story → breakdown → images), which stops at the storyboard
// gate as usual. (source='user' story; not a reference — only spot-check approval promotes one to few-shot.)
export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const { channelId, body, title } = parsed.data

  const gate = await requireChannelOwner(channelId)
  if (gate instanceof NextResponse) return gate

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
    .values({ channelId: channel.id, status: 'storyboard', language, storyId: story!.id })
    .returning()

  // Auto-use the user's story: build the Story Bible → scenes → images straight away (no story-review stop).
  await enqueueStep({ reelId: reel!.id, stepName: 'analyze_story' })

  return NextResponse.json({ reelId: reel!.id })
}
