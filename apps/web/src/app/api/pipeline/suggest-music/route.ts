import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getDb, reels, channels, stories } from '@reels/db'
import { eq } from 'drizzle-orm'
import { llmCall, ProviderRateLimitError } from '@reels/providers'
import { AudioPacksSchema, buildMusicPrompt } from '@reels/core'
import { buildMusicSteerPrompt, MusicSteerSchema, MUSIC_STEER_V1_VERSION } from '@reels/core/prompts/music-steer.v1'
import { getSession } from '@/lib/auth'

// AI suggestions for the storyboard music "Regenerate" field: a few concrete, on-mood ways to re-shape
// THIS reel's bed. Each is a ready-to-use steer (appended verbatim to the Eleven Music prompt). Cheap,
// text-only LLM call — no audio generated here.
export async function POST(req: NextRequest) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reelId } = (await req.json()) as { reelId: string }
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.storyId) return NextResponse.json({ error: 'Reel or story not found' }, { status: 404 })

  const [channel, story] = await Promise.all([
    db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) }),
    db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) }),
  ])
  if (!channel || !story) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const audioPacks = AudioPacksSchema.parse(channel.audioPacks ?? {})
  const moodTags = story.subgenreTags.length ? story.subgenreTags : audioPacks.audioMood?.moodTags ?? []
  // Describe the current bed the same way it's actually composed, so suggestions push AGAINST it.
  const currentBed = audioPacks.audioMood?.prompt?.trim() || buildMusicPrompt({
    audioMood: audioPacks.audioMood,
    toneIntensity: 5,
    nicheDescription: channel.nicheDescription,
    moodTags,
  })

  try {
    const { system, userMessage } = buildMusicSteerPrompt({
      storyTitle: story.title,
      storyExcerpt: story.body.slice(0, 600),
      moodTags,
      currentBed: currentBed.slice(0, 200),
    })
    const result = await llmCall({
      templateVersion: MUSIC_STEER_V1_VERSION,
      schema: MusicSteerSchema,
      system,
      messages: [{ role: 'user', content: userMessage }],
      maxTokens: 300,
    })
    return NextResponse.json({ suggestions: result.data.suggestions })
  } catch (err) {
    if (err instanceof ProviderRateLimitError) {
      return NextResponse.json({ error: 'Busy right now — try again in a moment.' }, { status: 429 })
    }
    return NextResponse.json({ error: 'Could not load suggestions.' }, { status: 502 })
  }
}
