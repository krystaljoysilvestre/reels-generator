'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { STORY_REJECTION_REASONS } from '@reels/core'
import { usePipelineStatus } from '@/hooks/usePipelineStatus'
import { StoryGenerating } from '@/components/StoryGenerating'
import { Typewriter } from '@/components/Typewriter'
import { phaseTicker, type ChannelMood } from '@/lib/pipeline-phases'

interface StoryStudioProps {
  reelId: string
  channelId: string
  channelName: string
  mood: ChannelMood
  genre?: string | undefined
  initialStatus: string
  initialCostCents: number
  story: { title: string; body: string; logline: string | null; subgenreTags: string[]; language: string } | null
}

export function StoryStudio({ reelId, channelId, channelName, mood, genre, initialStatus, initialCostCents, story }: StoryStudioProps) {
  const router = useRouter()
  const [generating, setGenerating] = useState(initialStatus === 'drafting' || initialStatus === 'rejected')
  const [draft, setDraft] = useState(0)
  const [reviewing, setReviewing] = useState(false) // the "why?" panel
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [startedAt] = useState(() => Date.now())

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
    await fetch('/api/pipeline/approve-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId, opMinutes: opMinutes() }),
    })
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
              <p className="text-xs text-muted">We&apos;ll write a different draft that fixes it.</p>
            </div>
            <div className="grid gap-2">
              {STORY_REJECTION_REASONS.map((r) => (
                <button
                  key={r.code}
                  onClick={() => regenerate(r.code)}
                  disabled={busy}
                  className="rounded-lg border border-border-strong px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:border-accent/50 hover:bg-accent-soft disabled:opacity-50"
                >
                  {r.label}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional: what specifically to change…"
              className="input h-20 resize-none"
            />
            <button onClick={() => setReviewing(false)} disabled={busy} className="btn-ghost btn-sm self-start">← Back</button>
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
            </div>
            <div className="flex gap-3 border-t border-border px-5 py-4">
              <button onClick={() => setReviewing(true)} disabled={busy} className="btn-secondary flex-1">Write another</button>
              <button onClick={approve} disabled={busy} className="btn-accent flex-1">{busy ? 'Saving…' : 'Use this story'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
