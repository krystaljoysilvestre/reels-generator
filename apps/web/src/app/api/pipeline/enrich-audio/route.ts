import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, stories } from '@reels/db'
import { eq } from 'drizzle-orm'
import { llmCall, ProviderRateLimitError } from '@reels/providers'
import { buildAudioEnrichPrompt, AudioEnrichSchema, AUDIO_ENRICH_V1_VERSION } from '@reels/core/prompts/audio-enrich.v1'
import { getSession } from '@/lib/auth'

// Audio enrichment pass: read the finished script and draft optional audio-direction notes (plain text,
// one per line) into the reel's Sound design field. Never touches the narration. Auto-runs once when the
// storyboard opens (if the field is empty); `force` re-drafts a fresh set.
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId, force } = (await req.json()) as { reelId: string; force?: boolean }
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) return NextResponse.json({ error: 'Reel or story not found' }, { status: 404 })

  // Auto-run only fills an empty field; the operator's edits are never overwritten unless they re-draft.
  if (reel.soundNotes?.trim() && !force) return NextResponse.json({ notes: reel.soundNotes })

  const [story, channel] = await Promise.all([
    db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
  ])
  if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  try {
    const { system, userMessage } = buildAudioEnrichPrompt({
      narration: story.body,
      genre: channel?.genreCategory && channel.genreCategory !== 'general' ? channel.genreCategory : undefined,
    })
    const { data } = await llmCall({
      templateVersion: AUDIO_ENRICH_V1_VERSION,
      schema: AudioEnrichSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 500,
    })
    const notes = (data.lines ?? []).map((l) => l.trim()).filter(Boolean).join('\n')
    await db.update(reels).set({ soundNotes: notes, updatedAt: new Date() }).where(eq(reels.id, reelId))
    return NextResponse.json({ notes })
  } catch (err) {
    if (err instanceof ProviderRateLimitError) return NextResponse.json({ error: 'Busy right now — try again shortly.' }, { status: 429 })
    return NextResponse.json({ error: 'Could not draft sound notes — try again.' }, { status: 502 })
  }
}
