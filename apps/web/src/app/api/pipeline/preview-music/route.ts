import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, stories } from '@reels/db'
import { eq } from 'drizzle-orm'
import { generateMusic, uploadBuffer, ProviderRateLimitError } from '@reels/providers'
import {
  AudioPacksSchema,
  ToneConfigSchema,
  buildMusicPrompt,
  estimateMusicLengthMs,
} from '@reels/core'
import { getSession } from '@/lib/auth'

// On-demand background bed for the storyboard: lets the operator HEAR and approve the music before
// committing to a render. Mirrors preview-animation — a direct, paid provider call (no worker job),
// result persisted to the reel so the UI plays it immediately.
//
// At the storyboard, neither timings (needs TTS) nor the annotated audioScript exist yet, so we size
// the bed from a pre-TTS estimate (OVER-generated — the mixer truncates a long bed but loops a short
// one) and tilt the prompt with the story's own subgenre mood. render-time generate_music reuses this
// exact bed when it's long enough to cover the final duration, so the operator ships what they vetted.
//
// AI-music channels only — preset/upload/none channels source their bed from the channel pool.

// Best-effort in-flight guard against a double-click launching two paid generations (in-memory, per
// instance — enough for the double-click it targets, same as preview-animation).
const inFlight = new Set<string>()

// Eleven Music is slow (tens of seconds). Give the route room beyond the platform default.
export const maxDuration = 300

export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // `instruction` = an optional plain-language steer typed on Regenerate ("more tense", "add a slow
  // heartbeat"). Eleven Music follows natural language, so it's appended to the prompt directly.
  const { reelId, force, instruction } = (await req.json()) as {
    reelId: string; force?: boolean; instruction?: string
  }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) return NextResponse.json({ error: 'Reel or story not found' }, { status: 404 })

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
  const audioPacks = AudioPacksSchema.parse(channel.audioPacks ?? {})
  if (audioPacks.musicMode !== 'ai') {
    return NextResponse.json({ error: 'This channel does not use AI-composed music.' }, { status: 400 })
  }

  // Auto-load asks for the bed only if there isn't one yet; the Regenerate button forces a fresh take.
  if (reel.musicKey && !force) {
    return NextResponse.json({ ok: true, musicKey: reel.musicKey, costCents: 0 })
  }

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 })

  const lockKey = `music:${reelId}`
  if (inFlight.has(lockKey)) {
    return NextResponse.json({ error: 'Already composing — hang tight.' }, { status: 409 })
  }
  inFlight.add(lockKey)

  try {
    const tone = ToneConfigSchema.parse(channel.toneConfig ?? {})
    // Story-level mood tilt: the annotated audioScript doesn't exist yet at the storyboard, so we tilt
    // with the story's subgenre tags (falling back to the channel's sonic-DNA mood).
    const moodTags = story.subgenreTags.length ? story.subgenreTags : audioPacks.audioMood?.moodTags ?? []
    const prompt = buildMusicPrompt({
      audioMood: audioPacks.audioMood,
      toneIntensity: tone.intensity,
      nicheDescription: channel.nicheDescription,
      moodTags,
      instruction,
    })
    const lengthMs = estimateMusicLengthMs({ narration: story.body, targetSeconds: channel.targetSeconds })

    const { audio, costCents } = await generateMusic({ prompt, lengthMs })
    const storageKey = `audio/reel/${reelId}.mp3`
    await uploadBuffer(storageKey, audio, 'audio/mpeg')
    await db
      .update(reels)
      .set({
        musicKey: storageKey,
        musicLengthMs: lengthMs,
        costCents: reel.costCents + (costCents ?? 0),
        updatedAt: new Date(),
      })
      .where(eq(reels.id, reelId))

    return NextResponse.json({ ok: true, musicKey: storageKey, costCents: costCents ?? 0 })
  } catch (err) {
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — give it a moment and try again.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'That bed didn’t come through — try again.' }, { status: 502 })
  } finally {
    inFlight.delete(lockKey)
  }
}
