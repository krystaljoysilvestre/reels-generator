import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels } from '@reels/db'
import { eq } from 'drizzle-orm'
import { enqueueStep } from '@reels/queue'
import { requireApiUser, requireReelCreationBudget } from '@/lib/api-access'
import { userOwnsChannel } from '@/lib/access'

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate

  const { channelId, generationMode, seed, dossier } = (await req.json().catch(() => ({}))) as {
    channelId?: string
    generationMode?: string
    seed?: string
    dossier?: string // Evidence-Based Narrative: the curated source material for this case (EBN channels only)
  }
  if (!channelId) return NextResponse.json({ error: 'channelId is required' }, { status: 400 })

  const db = getDb()
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  if (!(await userOwnsChannel(user, channelId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Evidence-Based Narrative channels are dossier-first: the story is generated strictly from curated
  // source material, so a reel without one has no evidence to work from (the generator fails closed
  // anyway — reject here for a clear, immediate error). 20k mirrors the provide-story ceiling.
  const cleanDossier = typeof dossier === 'string' ? dossier.trim().slice(0, 20000) : ''
  if (channel.storyMode === 'ebn' && !cleanDossier) {
    return NextResponse.json({ error: 'This is an Evidence-Based channel — a source dossier is required to create a reel.' }, { status: 400 })
  }

  // Per-user budget/quota + in-flight cap (multi-tenant cost safety). Admins are unlimited.
  const budgetGate = await requireReelCreationBudget(user)
  if (budgetGate) return budgetGate

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
    // EBN: freeze the curated dossier on the reel; the extractor turns it into the Evidence Bible.
    ...(cleanDossier ? { dossier: cleanDossier } : {}),
  }).returning()

  // Kick off the pipeline: generate_story runs, then the chain STOPS at the story_review gate
  // (operator approves the story before scenes/images are generated).
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })

  return NextResponse.json({ reelId: reel!.id })
}
