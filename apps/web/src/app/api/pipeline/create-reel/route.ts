import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, channelSeries } from '@reels/db'
import { and, eq } from 'drizzle-orm'
import { enqueueStep } from '@reels/queue'
import { resolveChannelPolicy, resolveGenreForNewReel } from '@reels/core'
import { requireApiUser, requireReelCreationBudget, isUuid } from '@/lib/api-access'
import { userOwnsChannel } from '@/lib/access'

export async function POST(req: NextRequest) {
  const gate = await requireApiUser()
  if (gate instanceof NextResponse) return gate
  const user = gate

  const { channelId, generationMode, seed, dossier, seriesId } = (await req.json().catch(() => ({}))) as {
    channelId?: string
    generationMode?: string
    seed?: string
    dossier?: string // Evidence-Based Narrative: the curated source material for this case (EBN channels only)
    seriesId?: string // optional: make this reel part of one of the channel's series (specs/channel-series.md)
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

  // Optional series. Scoped to THIS channel in the query itself, so a series id belonging to another
  // tenant simply doesn't resolve — no cross-channel read, and 404 rather than confirming it exists.
  // isUuid FIRST: a non-uuid string reaching a uuid column throws in Postgres, which would surface as a
  // 500 on plainly bad input instead of a 400.
  if (seriesId !== undefined && !isUuid(seriesId)) return NextResponse.json({ error: 'Invalid seriesId' }, { status: 400 })
  const series = seriesId
    ? await db.query.channelSeries.findFirst({ where: and(eq(channelSeries.id, seriesId), eq(channelSeries.channelId, channel.id)) })
    : undefined
  // 404, not 403: a series belonging to another channel must not be confirmed to exist.
  if (seriesId && !series) return NextResponse.json({ error: 'Series not found' }, { status: 404 })

  const language = (channel.languages[0] ?? 'tagalog').toLowerCase()
  const [reel] = await db.insert(reels).values({
    channelId: channel.id,
    status: 'drafting',
    language,
    // Optional topic request ("make one about …") — the story planner honors it for this reel only.
    ...(typeof seed === 'string' && seed.trim() ? { seedIdea: seed.trim().slice(0, 500) } : {}),
    // EBN: freeze the curated dossier on the reel; the extractor turns it into the Evidence Bible.
    ...(cleanDossier ? { dossier: cleanDossier } : {}),
    // Series + the genre it resolves to, FROZEN here and never re-derived (specs/channel-series.md).
    // Freeze the resolved source policy (series override wins over the channel's), for the same reason
    // the genre is frozen: an edit to the channel must never change what an existing reel was made under.
    sourcePolicy: resolveChannelPolicy(null, series ?? null, channel),
    ...(series ? { seriesId: series.id, genreCategory: resolveGenreForNewReel(series, channel) } : {}),
  }).returning()

  // Kick off the pipeline: generate_story runs, then the chain STOPS at the story_review gate
  // (operator approves the story before scenes/images are generated).
  await enqueueStep({ reelId: reel!.id, stepName: 'generate_story', channelId: channel.id, language })

  return NextResponse.json({ reelId: reel!.id })
}
