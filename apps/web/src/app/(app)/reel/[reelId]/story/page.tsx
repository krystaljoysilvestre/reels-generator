import { eq, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb, reels, channels, pipelineSteps } from '@reels/db'
import { ToneConfigSchema } from '@reels/core'
import { requireAuth } from '@/lib/auth'
import { channelMood } from '@/lib/pipeline-phases'
import { StoryStudio, type CriticSummary } from './StoryStudio'

// Read the best-of-N round persisted on the generate_story step (winner + losing takes + critic
// verdicts) and shape it for the story card. Null hides the section: old reels (pre-best-of-N
// output shape), BYO stories (step output doesn't match the shown story), or a failed critic.
function extractCritic(stepOutput: unknown, shownBody: string): CriticSummary | null {
  const out = stepOutput as {
    v?: number
    winner?: { narration?: string }
    winnerIdx?: number
    candidates?: Array<{ story?: { title?: string; logline?: string | null } }>
    critic?: { status?: string; rationale?: string; verdicts?: Array<{ candidateIdx?: number; note?: string }> }
  } | null
  if (!out || out.v !== 2 || !Array.isArray(out.candidates) || out.critic?.status !== 'ok') return null
  if (out.winner?.narration !== shownBody) return null // stale round or BYO story — don't mislabel it
  const noteByIdx = new Map((out.critic.verdicts ?? []).map((v) => [v.candidateIdx, v.note ?? '']))
  const runnersUp = out.candidates
    .map((c, idx) => ({ idx, title: c.story?.title ?? '', logline: c.story?.logline ?? null }))
    .filter((c) => c.idx !== out.winnerIdx && c.title)
    .map((c) => ({ title: c.title, logline: c.logline, note: noteByIdx.get(c.idx) ?? '' }))
  return { rationale: out.critic.rationale ?? '', runnersUp }
}

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

  const storyStep = reel.story
    ? await db.query.pipelineSteps.findFirst({
        where: and(eq(pipelineSteps.reelId, reelId), eq(pipelineSteps.stepName, 'generate_story')),
        columns: { output: true },
      })
    : null
  const critic = reel.story ? extractCritic(storyStep?.output, reel.story.body) : null

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
      critic={critic}
    />
  )
}
