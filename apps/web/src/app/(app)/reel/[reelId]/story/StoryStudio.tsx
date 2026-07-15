'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { STORY_REJECTION_REASONS } from '@reels/core'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { StoryGenerating } from '@/components/StoryGenerating'
import { Typewriter } from '@/components/Typewriter'
import { phaseTicker, type ChannelMood } from '@/lib/pipeline-phases'

// Summary for the story card: why the shown draft won (+ the takes it beat, legacy best-of-N),
// and the story's composition chips (studio: what parts it's made of).
export interface CriticSummary {
  rationale: string
  runnersUp: Array<{ title: string; logline: string | null; note: string }>
  elements: string[]
}

interface StoryStudioProps {
  reelId: string
  channelId: string
  channelName: string
  mood: ChannelMood
  genre?: string | undefined
  initialStatus: string
  initialCostCents: number
  story: {
    id: string
    title: string
    body: string
    logline: string | null
    subgenreTags: string[]
    language: string
    isReference: boolean
  } | null
  critic: CriticSummary | null
}

export function StoryStudio({ reelId, channelId, channelName, mood, genre, initialStatus, initialCostCents, story, critic }: StoryStudioProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(initialStatus === 'drafting' || initialStatus === 'rejected')
  const [draft, setDraft] = useState(0)
  const [reviewing, setReviewing] = useState(false) // the "why?" panel
  const [selectedReason, setSelectedReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [isReference, setIsReference] = useState(story?.isReference ?? false)
  const [refBusy, setRefBusy] = useState(false)

  // Flag this story as a voice reference — it joins the set future stories learn their voice from.
  async function toggleReference() {
    if (!story) return
    setRefBusy(true)
    const next = !isReference
    const res = await fetch('/api/story/toggle-reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId: story.id, isReference: next }),
    })
    if (res.ok) setIsReference(next)
    setRefBusy(false)
  }

  // Poll only while a draft is being written; the hook refreshes the server (new story) at the boundary.
  const status = usePipelineStatus(reelId, { enabled: generating, intervalMs: 2200 })
  useEffect(() => {
    if (status && (status.reelStatus === 'story_review' || status.reelStatus === 'failed')) setGenerating(false)
  }, [status])

  const reelStatus = status?.reelStatus ?? initialStatus
  const costCents = status?.costCents ?? initialCostCents
  const failed = reelStatus === 'failed'
  const opMinutes = () => Math.round((Date.now() - startedAt) / 60000)

  async function approve() {
    setBusy(true)
    setActionError(null)
    // Only navigate once the transition actually succeeded — otherwise a stale/rejected 409 would leave
    // the reel at story_review while we send the operator to a storyboard that never populates.
    const res = await fetch('/api/pipeline/approve-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId, opMinutes: opMinutes() }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setActionError(body.error ?? 'Could not approve this story. Refresh and try again.')
      setBusy(false)
      return
    }
    router.push(`/storyboard/${reelId}`)
  }

  async function regenerate(reasonCode: string) {
    setBusy(true)
    const res = await fetch('/api/pipeline/regenerate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId, reasonCode, note: note.trim() || undefined, opMinutes: opMinutes() }),
    })
    if (res.ok) {
      setDraft((d) => d + 1)
      setReviewing(false)
      setSelectedReason('')
      setNote('')
      setGenerating(true) // restart polling for the new draft
    }
    setBusy(false)
  }

  async function retry() {
    setBusy(true)
    await fetch('/api/pipeline/retry-reel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId }),
    })
    setGenerating(true)
    setBusy(false)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Link href={`/channel/${channelId}`} className="btn-ghost btn-sm -ml-1.5" title="Back to channel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">New reel</h1>
            <p className="truncate text-xs text-muted">{channelName}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl p-8">
        {failed ? (
          <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
            <p className="text-base font-semibold text-ink">The story couldn&apos;t be written</p>
            <p className="max-w-sm text-sm text-muted">Something went wrong while writing it. You can try again.</p>
            <button onClick={retry} disabled={busy} className="btn-accent mt-1">{busy ? 'Retrying…' : 'Try again'}</button>
          </div>
        ) : generating || !story ? (
          <StoryGenerating mood={mood} genre={genre} lines={phaseTicker('writing', mood)} draft={draft} costCents={costCents} />
        ) : reviewing ? (
          <div className="card flex flex-col gap-4 p-5">
            <div>
              <p className="text-sm font-semibold text-ink">What didn&apos;t land?</p>
              <p className="text-xs text-muted">Pick what&apos;s off and add a note — the next drafts are judged against it.</p>
            </div>
            <div className="grid gap-2">
              {STORY_REJECTION_REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => setSelectedReason(r.code)}
                  disabled={busy}
                  aria-pressed={selectedReason === r.code}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-50 ${selectedReason === r.code ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent' : 'border-border-strong text-ink hover:border-accent/50 hover:bg-accent-soft'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What specifically to change… (optional)"
              className="input h-20 resize-none"
            />
            <div className="flex gap-3">
              <button onClick={() => setReviewing(false)} disabled={busy} className="btn-secondary flex-1">← Back</button>
              <button
                onClick={() => regenerate(selectedReason)}
                disabled={busy || !selectedReason}
                className="btn-accent flex-1"
              >
                {busy ? 'Writing…' : 'Write another'}
              </button>
            </div>
          </div>
        ) : (
          <div className="card animate-fade-in flex flex-col overflow-hidden">
            <div className="border-b border-border px-5 py-4">
              <p className="text-base font-semibold tracking-tight text-ink">
                <Typewriter text={story.title} />
              </p>
              {story.logline && <p className="mt-1 text-sm text-muted">{story.logline}</p>}
              {story.subgenreTags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {story.subgenreTags.map((t) => (
                    <span key={t} className="badge bg-subtle text-muted">{t}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-ink/90">
              {story.body}
            </div>
            <div className="flex items-center gap-2 border-t border-border bg-subtle/40 px-5 py-2.5 text-xs text-muted">
              <span className="badge bg-surface text-muted ring-1 ring-inset ring-border">{story.language.toUpperCase()}</span>
              <span>est {Math.ceil(story.body.split(' ').length / 2.5)}s</span>
              <span className="text-faint">·</span>
              <span className="font-mono tabular-nums text-ink">${(costCents / 100).toFixed(2)}</span>
              <span>so far</span>
              <button
                onClick={toggleReference}
                disabled={refBusy}
                title="Voice references teach future stories how this channel sounds."
                className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
                  isReference
                    ? 'bg-accent/10 text-accent ring-accent/30'
                    : 'bg-surface text-muted ring-border hover:text-ink'
                }`}
              >
                {isReference ? '✓ Voice reference' : 'Make it a voice reference'}
              </button>
            </div>
            {critic && (
              <div className="border-t border-border px-5 py-3">
                {critic.elements.length > 0 && (
                  <div className="mb-2.5 flex flex-wrap gap-1.5">
                    {critic.elements.map((e, i) => (
                      <span key={i} className="badge bg-subtle text-muted ring-1 ring-inset ring-border">{e}</span>
                    ))}
                  </div>
                )}
                {critic.rationale && (
                <p className="text-xs leading-relaxed text-muted">
                  <span className="font-medium text-ink">Why this one:</span> {critic.rationale}
                </p>
                )}
                {critic.runnersUp.length > 0 && (
                  <details className="mt-2 group">
                    <summary className="cursor-pointer select-none text-xs font-medium text-muted transition-colors hover:text-ink">
                      Other takes ({critic.runnersUp.length})
                    </summary>
                    <p className="mt-1.5 text-xs text-faint">The takes that didn&rsquo;t make the cut, and why.</p>
                    <ul className="mt-2 space-y-2">
                      {critic.runnersUp.map((r, i) => (
                        <li key={i} className="rounded-lg bg-subtle/60 px-3 py-2">
                          <p className="text-xs font-medium text-ink">{r.title}</p>
                          {r.logline && <p className="mt-0.5 text-xs text-muted">{r.logline}</p>}
                          {r.note && <p className="mt-1 text-xs italic text-faint">&ldquo;{r.note}&rdquo;</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
            <div className="border-t border-border px-5 py-4">
              {actionError && <p className="mb-3 text-sm text-danger">{actionError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setReviewing(true)} disabled={busy} className="btn-secondary flex-1">Write another</button>
                <button onClick={approve} disabled={busy} className="btn-accent flex-1">{busy ? 'Saving…' : 'Use this story'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
