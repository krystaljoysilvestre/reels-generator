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
  // Finishing QA punch-list (detection-only) — a quick, targeted "worth a look before you approve"
  // list from the finishing judge. Empty/absent = nothing flagged.
  qaIssues: Array<{ axis: string; problem: string }>
  // The read-gate verdict, kept separate from `rationale` so it can render as its own pill.
  readGate: { pass: boolean; label: string; reason: string } | null
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
    setActionError(null)
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
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setActionError(body.error ?? 'Couldn’t write a new draft. Refresh and try again.')
    }
    setBusy(false)
  }

  async function retry() {
    setBusy(true)
    setActionError(null)
    // Only start polling if the retry actually kicked off — otherwise the UI would spin on "generating"
    // forever against an error (e.g. "No failed step to retry").
    const res = await fetch('/api/pipeline/retry-reel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId }),
    })
    if (res.ok) {
      setGenerating(true)
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setActionError(body.error ?? 'Could not retry. Refresh and try again.')
    }
    setBusy(false)
  }

  const backLink = (
    <Link
      href={`/channel/${channelId}`}
      title="Back to channel"
      className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-sm border border-white/[0.14] bg-white/[0.05] text-white transition-colors hover:bg-white/[0.1]"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m15 18-6-6 6-6" />
      </svg>
    </Link>
  )

  // ── Pre-story states keep the light single-column layout (see the "story generating" mock) ──
  if (failed || generating || !story) {
    return (
      <div className="min-h-full">
        <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <Link href={`/channel/${channelId}`} className="btn-ghost btn-sm -ml-1.5" title="Back to channel">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m15 18-6-6 6-6" />
              </svg>
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-700 -tracking-[0.02em] text-ink">New reel</h1>
              <p className="truncate text-xs text-muted">{channelName}</p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-2xl p-8">
          {failed ? (
            <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="font-display text-lg font-700 -tracking-[0.02em] text-ink">The story couldn&apos;t be written</p>
              <p className="max-w-sm text-sm text-muted">Something went wrong while writing it. You can try again.</p>
              {actionError && <p className="text-sm text-danger">{actionError}</p>}
              <button onClick={retry} disabled={busy} className="btn-accent mt-1">{busy ? 'Retrying…' : 'Try again'}</button>
            </div>
          ) : (
            <StoryGenerating mood={mood} genre={genre} lines={phaseTicker('writing', genre)} draft={draft} costCents={costCents} />
          )}
        </div>
      </div>
    )
  }

  const runtimeSec = Math.ceil(story.body.split(' ').length / 2.5)

  // ── The cutting room: dark story stage + light editing rail ──
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      {/* ═══ LEFT · story stage (the story as a film title card) ═══ */}
      <div className="stage flex min-h-[440px] w-full flex-shrink-0 flex-col bg-night-800 lg:min-h-0 lg:w-[46%] lg:min-w-[420px]">
        <div className="stage-leak" />
        <div className="film-grain" />
        {/* 9:16 frame guide — the shape this story will become */}
        <div className="pointer-events-none absolute bottom-[104px] top-24 left-1/2 aspect-[9/16] -translate-x-1/2 rounded-lg border border-white/[0.08]" />

        <div className="relative flex items-center gap-3.5 px-7 py-5">
          {backLink}
          <div className="flex-1" />
          <div className="text-right font-mono text-[11px] leading-normal tracking-[0.1em] text-white/55">
            <span className="uppercase">{channelName}</span>
            <br />
            <span className="text-white/35">STORY · TAKE {String(draft + 1).padStart(2, '0')}</span>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col justify-center px-7 py-6 sm:px-11">
          {genre && (
            <p className="gradient-text animate-stage-up text-xs font-600 uppercase tracking-[0.24em]" style={{ animationDelay: '.02s' }}>
              {genre.replace(/_/g, ' ')}
            </p>
          )}
          <h1
            className="animate-stage-up mt-3.5 text-[38px] font-800 leading-[0.98] -tracking-[0.03em] text-white sm:text-[52px] 2xl:text-[60px]"
            style={{ animationDelay: '.09s' }}
          >
            <Typewriter text={story.title} />
          </h1>
          {story.logline && (
            <p className="animate-stage-up mt-5 max-w-[390px] text-[15px] leading-relaxed text-white/[0.74]" style={{ animationDelay: '.16s' }}>
              {story.logline}
            </p>
          )}
          {story.subgenreTags.length > 0 && (
            <div className="animate-stage-up mt-5 flex flex-wrap gap-2" style={{ animationDelay: '.23s' }}>
              {story.subgenreTags.map((t) => (
                <span key={t} className="rounded-2xl border border-white/[0.12] bg-white/[0.06] px-3 py-1 text-xs font-600 text-white/85">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* clapperboard slate */}
        <div className="relative mx-7 mb-6 overflow-hidden rounded-md border border-white/10 bg-night-800/60 backdrop-blur">
          <div className="clapper-band h-3.5" />
          <div className="grid grid-cols-4 gap-2 px-4 py-2.5">
            <div>
              <p className="slate-label">TAKE</p>
              <p className="slate-value">{String(draft + 1).padStart(2, '0')}</p>
            </div>
            <div>
              <p className="slate-label">LANG</p>
              <p className="slate-value">{story.language.toUpperCase()}</p>
            </div>
            <div>
              <p className="slate-label">RUNTIME</p>
              <p className="slate-value">{runtimeSec}s</p>
            </div>
            <div>
              <p className="slate-label">SPEND</p>
              <p className="gradient-text font-mono text-sm font-400 tabular-nums" title="What this reel has cost so far">
                ${(costCents / 100).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ RIGHT · editing rail ═══ */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-bg">
        <div className="mx-auto max-w-[560px] px-6 py-8 sm:px-10">
          {reviewing ? (
            /* Reject → "what didn't land?" reason picker + note */
            <div className="animate-fade-in flex flex-col gap-4">
              <div>
                <h2 className="font-display text-xl font-700 -tracking-[0.02em] text-ink">What didn&apos;t land?</h2>
                <p className="mt-1 text-[13px] text-muted">Pick what&apos;s off and add a note — the next drafts are judged against it.</p>
              </div>
              <div className="grid gap-2">
                {STORY_REJECTION_REASONS.map((r) => (
                  <button
                    key={r.code}
                    onClick={() => setSelectedReason(r.code)}
                    disabled={busy}
                    aria-pressed={selectedReason === r.code}
                    className={`rounded-sm border px-3.5 py-3 text-left text-sm font-600 transition-colors disabled:opacity-50 ${
                      selectedReason === r.code
                        ? 'border-accent bg-accent-soft text-accent ring-1 ring-accent'
                        : 'border-border-mid bg-surface text-ink hover:border-accent-ring hover:bg-accent-soft'
                    }`}
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
              {actionError && <p className="text-sm text-danger">{actionError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setReviewing(false)} disabled={busy} className="btn-secondary flex-1 py-3.5">← Back</button>
                <button onClick={() => regenerate(selectedReason)} disabled={busy || !selectedReason} className="btn-accent flex-[1.4] py-3.5">
                  {busy ? 'Writing…' : 'Write another'}
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-fade-in">
              <div className="mb-5 flex items-center justify-between gap-3">
                <p className="micro-label tracking-[0.16em]">The read</p>
                <span className="rounded-2xl border border-accent/[0.22] bg-brand-wash px-2.5 py-1 text-[11px] font-700 uppercase tracking-[0.08em] text-accent">
                  Story · step 1 of 3
                </span>
              </div>

              {/* the story */}
              <div className="max-h-[330px] overflow-y-auto whitespace-pre-line pr-2 text-base font-400 leading-[1.78] text-body">
                {story.body}
              </div>

              {/* voice reference */}
              <button
                onClick={toggleReference}
                disabled={refBusy}
                title="Voice references teach future stories how this channel sounds."
                aria-pressed={isReference}
                className="card mt-5 flex w-full items-center gap-3 px-4 py-3.5 text-left transition-shadow hover:shadow-sm disabled:opacity-60"
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-sm bg-pair-blue-purple">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-600 text-ink">Make it a voice reference</span>
                  <span className="block text-xs text-faint">Future stories learn how this channel sounds.</span>
                </span>
                {/* switch */}
                <span
                  className={`relative h-[23px] w-10 flex-shrink-0 rounded-2xl transition-colors ${isReference ? 'bg-pair-purple-pink' : 'bg-subtle-strong'}`}
                >
                  <span
                    className={`absolute top-0.5 h-[19px] w-[19px] rounded-full bg-white shadow-xs transition-all ${isReference ? 'right-0.5' : 'left-0.5'}`}
                  />
                </span>
              </button>

              {critic?.elements.length ? (
                <>
                  <p className="micro-label mb-2.5 mt-6 tracking-micro-wide">Built from</p>
                  <div className="flex flex-wrap gap-[7px]">
                    {critic.elements.map((e, i) => (
                      <span key={i} className="rounded-[8px] border border-border-mid bg-surface px-2.5 py-1 text-xs font-600 text-muted">
                        {e}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}

              {(critic?.rationale || critic?.readGate) && (
                <div className="card relative mt-5 overflow-hidden py-4 pl-5 pr-4 shadow-sm">
                  <span className="absolute inset-y-0 left-0 w-1 bg-brand-bar" />
                  <div className="mb-2.5 flex items-center gap-2.5">
                    <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[8px] bg-pair-purple-pink">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M15 9h.01M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5" />
                      </svg>
                    </span>
                    <span className="text-sm font-700 text-ink">Why this one</span>
                  </div>
                  {critic.rationale && <p className="text-[13px] leading-relaxed text-body">{critic.rationale}</p>}
                  {critic.readGate && (
                    <span
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1 text-[11px] font-600 ${
                        critic.readGate.pass ? 'bg-success-soft text-success' : 'bg-warning-soft text-warning'
                      }`}
                      title={critic.readGate.reason}
                    >
                      {critic.readGate.pass && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                      {critic.readGate.label}
                    </span>
                  )}
                </div>
              )}

              {critic?.qaIssues.length ? (
                <div className="mt-3.5 rounded-lg border border-warning-ring bg-warning-soft px-4 py-4">
                  <p className="flex items-center gap-2 text-xs font-700 text-warning">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <path d="M12 9v4M12 17h.01" />
                    </svg>
                    Worth a look before you approve ({critic.qaIssues.length})
                  </p>
                  <ul className="mt-2.5 flex flex-col gap-2.5">
                    {critic.qaIssues.map((q, i) => (
                      <li key={i} className="text-xs leading-normal text-muted">
                        <span className="mr-2 inline-block rounded-[6px] border border-border-mid bg-surface px-2 py-0.5 align-middle text-[10px] font-700 text-faint">
                          {q.axis}
                        </span>
                        {q.problem}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {/* Legacy best-of-N takes — the v3 pipeline writes one story, so this is empty on new
                  reels, but older reels still have it. */}
              {critic?.runnersUp.length ? (
                <details className="group mt-3.5">
                  <summary className="cursor-pointer select-none text-xs font-600 text-muted transition-colors hover:text-ink">
                    Other takes ({critic.runnersUp.length})
                  </summary>
                  <p className="mt-1.5 text-xs text-faint">The takes that didn&rsquo;t make the cut, and why.</p>
                  <ul className="mt-2 space-y-2">
                    {critic.runnersUp.map((r, i) => (
                      <li key={i} className="rounded-sm bg-subtle px-3 py-2">
                        <p className="text-xs font-600 text-ink">{r.title}</p>
                        {r.logline && <p className="mt-0.5 text-xs text-muted">{r.logline}</p>}
                        {r.note && <p className="mt-1 text-xs italic text-faint">&ldquo;{r.note}&rdquo;</p>}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              {actionError && <p className="mt-4 text-sm text-danger">{actionError}</p>}
              <div className="mt-6 flex gap-3">
                <button onClick={() => setReviewing(true)} disabled={busy} className="btn-secondary flex-1 py-3.5">Write another</button>
                <button onClick={approve} disabled={busy} className="btn-accent flex-[1.4] gap-2 py-3.5 font-700">
                  {busy ? 'Saving…' : 'Use this story'}
                  {!busy && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
