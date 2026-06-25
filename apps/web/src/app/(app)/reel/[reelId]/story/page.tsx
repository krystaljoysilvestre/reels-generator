import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb, reels, channels } from '@reels/db'
import { ToneConfigSchema } from '@reels/core'
import { requireAuth } from '@/lib/auth'
import { channelMood } from '@/lib/pipeline-phases'
import { StoryStudio } from './StoryStudio'

export const dynamic = 'force-dynamic'

// Per-reel Story Studio — the guided story phase (generate/BYO → watch it write → review →
// regenerate-with-reason). Once past the story phase, the reel's home is the storyboard.
export default async function ReelStoryPage({ params }: { params: Promise<{ reelId: string }> }) {
  await requireAuth()
  const { reelId } = await params
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId), with: { story: true } })
  if (!reel) redirect('/dashboard')
  if (!['drafting', 'story_review', 'rejected'].includes(reel.status)) redirect(`/storyboard/${reelId}`)

  const channel = await db.query.channels.findFirst({
    where: eq(channels.id, reel.channelId),
    columns: { name: true, toneConfig: true, genreCategory: true },
  })
  const mood = channelMood(ToneConfigSchema.parse(channel?.toneConfig ?? {}))

  return (
    <StoryStudio
      reelId={reel.id}
      channelId={reel.channelId}
      channelName={channel?.name ?? ''}
      mood={mood}
      genre={channel?.genreCategory ?? 'general'}
      initialStatus={reel.status}
      initialCostCents={reel.costCents}
      story={
        reel.story
          ? {
              title: reel.story.title,
              body: reel.story.body,
              logline: reel.story.logline,
              subgenreTags: reel.story.subgenreTags,
              language: reel.story.language,
            }
          : null
      }
    />
  )
}
