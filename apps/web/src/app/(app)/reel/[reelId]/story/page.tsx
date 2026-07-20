import { eq, and } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { getDb, reels, channels, pipelineSteps } from '@reels/db'
import { ToneConfigSchema } from '@reels/core'
import { requireAuth } from '@/lib/auth'
import { channelMood } from '@/lib/pipeline-phases'
import { StoryStudio, type CriticSummary } from './StoryStudio'

// Read the round persisted on the generate_story step and shape it for the story card.
// v2 = legacy best-of-N (winner + losing takes + ranking-critic verdicts); v3 = studio pipeline
// (one plan → one story: the plan's justification + the binary gate verdict, no runner-up takes).
// Null hides the section: old reels (pre-versioned shape), BYO stories (step output doesn't match
// the shown story), or a failed critic/gate.
function extractCritic(stepOutput: unknown, shownBody: string): CriticSummary | null {
  const out = stepOutput as {
    v?: number
    winner?: { narration?: string }
    winnerIdx?: number
    candidates?: Array<{ story?: { title?: string; logline?: string | null } }>
    critic?: { status?: string; rationale?: string; verdicts?: Array<{ candidateIdx?: number; note?: string }> }
    // v3 (studio)
    plan?: { whyThisStory?: string; elements?: Record<string, string | undefined> | null } | null
    gate?: { status?: string; verdicts?: Array<{ pass?: boolean; reason?: string }>; retried?: boolean }
    finishingQA?: { status?: string; issues?: Array<{ axis?: string; problem?: string }>; summary?: string }
  } | null
  if (!out) return null
  if (out.winner?.narration !== shownBody) return null // stale round or BYO story — don't mislabel it

  // Finishing QA punch-list (detection-only) — present only when the judge ran and flagged something.
  const qaIssues =
    out.finishingQA?.status === 'ok'
      ? (out.finishingQA.issues ?? [])
          .map((i) => ({ axis: (i.axis ?? '').replace(/_/g, ' '), problem: i.problem ?? '' }))
          .filter((i) => i.problem)
      : []

  if (out.v === 3) {
    const why = out.plan?.whyThisStory?.trim() ?? ''
    const verdict = out.gate?.status === 'ok' ? out.gate.verdicts?.[out.gate.verdicts.length - 1] : undefined
    const gateLine = verdict?.reason?.trim()
      ? `${verdict.pass ? 'Passed the read' : 'Flagged at the read'}${out.gate?.retried ? ' (after one rewrite)' : ''}: ${verdict.reason.trim()}`
      : ''
    const rationale = [why, gateLine].filter(Boolean).join(' · ')
    // The story's composition chips (what parts it's made of) — order chosen for readability.
    const el = out.plan?.elements ?? null
    const elements = el
      ? (['structure', 'pov', 'role', 'setting', 'anchor', 'trigger', 'turn', 'aftereffect'] as const)
          .map((k) => el[k]?.trim())
          .filter((s): s is string => !!s)
          .map((s) => s.replace(/_/g, ' '))
      : []
    return rationale || elements.length || qaIssues.length ? { rationale, runnersUp: [], elements, qaIssues } : null
  }

  if (out.v !== 2 || !Array.isArray(out.candidates) || out.critic?.status !== 'ok') return null
  const noteByIdx = new Map((out.critic.verdicts ?? []).map((v) => [v.candidateIdx, v.note ?? '']))
  const runnersUp = out.candidates
    .map((c, idx) => ({ idx, title: c.story?.title ?? '', logline: c.story?.logline ?? null }))
    .filter((c) => c.idx !== out.winnerIdx && c.title)
    .map((c) => ({ title: c.title, logline: c.logline, note: noteByIdx.get(c.idx) ?? '' }))
  return { rationale: out.critic.rationale ?? '', runnersUp, elements: [], qaIssues: [] }
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
              id: reel.story.id,
              title: reel.story.title,
              body: reel.story.body,
              logline: reel.story.logline,
              subgenreTags: reel.story.subgenreTags,
              language: reel.story.language,
              isReference: reel.story.isReference,
            }
          : null
      }
      critic={critic}
    />
  )
}
