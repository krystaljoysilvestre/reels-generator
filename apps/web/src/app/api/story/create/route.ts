import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { getDb, channels, stories } from '@reels/db'
import { requireChannelOwner } from '@/lib/api-access'

// Save a story to the channel's library without starting a reel. The creator's own words, banked for
// later — this is also the duplicate action (the client posts an existing story's text back).
// Not a reference: only earned examples (spot-check approvals, performance promotions) join the
// few-shot pool. Wizard sample scripts are the one exception, set at channel creation.

const InputSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
  title: z.string().trim().max(120).optional(),
})

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

  const firstLine = body.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Untitled'
  const [story] = await db
    .insert(stories)
    .values({
      channelId: channel.id,
      source: 'user',
      origin: 'library',
      language: (channel.languages[0] ?? 'tagalog').toLowerCase(),
      title: (title || firstLine).slice(0, 120),
      body,
      isReference: false,
    })
    .returning({ id: stories.id })

  return NextResponse.json({ storyId: story!.id })
}
