import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { getDb, reels, channels, stories } from '@reels/db'
import { enqueueStep } from '@reels/queue'
import { requireChannelOwner, requireStoryOwner, requireReelCreationBudget } from '@/lib/api-access'

// BYO script: the operator provides their own story for this reel, so generate_story is skipped.
//
// Two doors, one shelf. `body` = pasted text (saved to the library on the way through). `storyId` = a
// story already saved in the library ("Make a reel"), which is LINKED, never copied — one story row,
// one script, so scene-text edits can't desync from a duplicate.
//
// Where the reel starts depends on who wrote the story. User-written text needs no review — they wrote
// it — so it goes straight to 'storyboard' and the build kicks off (analyze_story → breakdown → images),
// stopping at the storyboard gate as usual. AI text from the library is a single pass with no planner and
// no critic, so it stops at 'story_review' first: approve to build, or reject to have the real Writer
// chain take it over (which relinks the reel to its own story and frees this one again).
// (source='user' stories are not references — only spot-check approval promotes one to few-shot.)

const PasteSchema = z.object({
  channelId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
  title: z.string().trim().max(120).optional(),
})
const SavedSchema = z.object({ storyId: z.string().uuid() })
const InputSchema = z.union([SavedSchema, PasteSchema])

const isUniqueViolation = (e: unknown) => typeof e === 'object' && e !== null && 'code' in e && (e as { code?: string }).code === '23505'
export async function POST(req: NextRequest) {
  const parsed = InputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', issues: parsed.error.flatten() }, { status: 400 })
  }
  const db = getDb()

  // ── Door 1: a story already saved in the library ────────────────────────────
  if ('storyId' in parsed.data) {
    const { storyId } = parsed.data
    const gate = await requireStoryOwner(storyId)
    if (gate instanceof NextResponse) return gate

    // Only what's actually on the shelf can start a reel. Pipeline rows are reel artifacts — and every
    // story regeneration leaves an unlinked, abandoned draft behind that would otherwise pass the
    // ownership + not-yet-used checks here. The shelf rule has to hold at the route, not just in the UI.
    const story = await db.query.stories.findFirst({
      where: and(eq(stories.id, storyId), inArray(stories.origin, ['setup', 'library'])),
    })
    if (!story) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const existing = await db.select({ id: reels.id }).from(reels).where(eq(reels.storyId, storyId)).limit(1)
    if (existing.length > 0) {
      return NextResponse.json({ error: 'This story already has a reel. Duplicate it to make another.' }, { status: 409 })
    }

    const limitGate = await requireReelCreationBudget(gate)
    if (limitGate) return limitGate

    // AI-written library text hasn't been through the Writer chain's critic — review it first.
    const status = story.source === 'ai' ? 'story_review' as const : 'storyboard' as const
    let reel
    try {
      const inserted = await db
        .insert(reels)
        .values({ channelId: story.channelId, status, language: story.language, storyId: story.id })
        .returning()
      reel = inserted[0]
    } catch (err) {
      // uq_reels_story: a concurrent make-reel won the race between our check and this insert.
      if (isUniqueViolation(err)) {
        return NextResponse.json({ error: 'This story already has a reel. Duplicate it to make another.' }, { status: 409 })
      }
      throw err
    }

    if (status === 'storyboard') await enqueueStep({ reelId: reel!.id, stepName: 'analyze_story' })
    return NextResponse.json({ reelId: reel!.id, status })
  }

  // ── Door 2: pasted text ─────────────────────────────────────────────────────
  const { channelId, body, title } = parsed.data
  const gate = await requireChannelOwner(channelId)
  if (gate instanceof NextResponse) return gate

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  const limitGate = await requireReelCreationBudget(gate)
  if (limitGate) return limitGate

  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const firstLine = body.split('\n').map((l) => l.trim()).find(Boolean) ?? 'Untitled'
  const storyTitle = (title || firstLine).slice(0, 120)

  // Insert the story first, then the reel already linked + at the gate — so a reel never exists at
  // story_review without its story. origin 'library': their own script belongs on their shelf too.
  const [story] = await db
    .insert(stories)
    .values({ channelId: channel.id, source: 'user', origin: 'library', language, title: storyTitle, body, isReference: false })
    .returning()
  const [reel] = await db
    .insert(reels)
    .values({ channelId: channel.id, status: 'storyboard', language, storyId: story!.id })
    .returning()

  // Auto-use the user's story: build the Story Bible → scenes → images straight away (no story-review stop).
  await enqueueStep({ reelId: reel!.id, stepName: 'analyze_story' })

  return NextResponse.json({ reelId: reel!.id, status: 'storyboard' })
}
