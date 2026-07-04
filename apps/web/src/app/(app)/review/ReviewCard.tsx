'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { InferSelectModel } from 'drizzle-orm'
import type { reels, stories } from '@reels/db'

type Reel = InferSelectModel<typeof reels>
type Story = InferSelectModel<typeof stories>

const REASON_CODES = [
  { code: 'weak_hook',       label: 'Weak hook' },
  { code: 'twist_predictable', label: 'Twist too predictable' },
  { code: 'pacing',          label: 'Pacing drags' },
  { code: 'off_culture',     label: 'Not believable / off-culture' },
  { code: 'voice_mismatch',  label: 'Voice mismatch' },
  { code: 'other',           label: 'Other…' },
]

interface ReviewCardProps {
  reel: Reel
  story: Story
  remaining: number
  allPendingIds: string[]
}

export function ReviewCard({ reel, story, remaining, allPendingIds }: ReviewCardProps) {
  const router = useRouter()
  const [rejecting, setRejecting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Operator-minutes timer — starts when the card mounts [E5.6]
  const [startedAt] = useState(Date.now())

  async function handleApprove() {
    setLoading(true)
    setError(null)
    const opMinutes = Math.round((Date.now() - startedAt) / 60000)
    // Navigate only on success — a stale/double-submit 409 would otherwise send the operator to a
    // storyboard that never populates while the reel is stuck at story_review.
    const res = await fetch('/api/pipeline/approve-story', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, opMinutes }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? 'Could not approve this story. Refresh and try again.')
      setLoading(false)
      return
    }
    // Continue THIS reel into the storyboard — scenes + images are generating now and appear there
    // once ready (the chain stops at the storyboard gate for editing + voice + render).
    router.push(`/storyboard/${reel.id}`)
  }

  async function handleReject(reasonCode: string) {
    setLoading(true)
    setError(null)
    const opMinutes = Math.round((Date.now() - startedAt) / 60000)
    const res = await fetch('/api/pipeline/reject-story', {
      method: 'POST',
      body: JSON.stringify({ reelId: reel.id, reasonCode, note, opMinutes }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      setError(body.error ?? 'Could not reject this story. Refresh and try again.')
      setLoading(false)
      return
    }
    const nextId = allPendingIds.find((id) => id !== reel.id)
    if (nextId) router.push(`/review?reelId=${nextId}`)
    else router.push('/dashboard')
  }

  if (rejecting) {
    return (
      <div className="card flex flex-col gap-4 p-5">
        <div>
          <p className="text-sm font-semibold text-ink">Why reject?</p>
          <p className="text-xs text-muted">Pick a reason — it shapes the next take.</p>
        </div>
        <div className="grid gap-2">
          {REASON_CODES.map((r) => (
            <button
              key={r.code}
              onClick={() => handleReject(r.code)}
              disabled={loading}
              className="rounded-lg border border-border-strong px-3 py-2.5 text-left text-sm font-medium text-ink transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
            >
              {r.label}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note…"
          className="input h-20 resize-none"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button onClick={() => setRejecting(false)} className="btn-ghost btn-sm self-start">
          ← Back
        </button>
      </div>
    )
  }

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Story header */}
      <div className="border-b border-border px-5 py-4">
        <p className="text-base font-semibold tracking-tight text-ink">{story.title}</p>
        <p className="mt-1 text-sm text-muted">{story.logline}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {story.subgenreTags.map((t) => (
            <span key={t} className="badge bg-subtle text-muted">{t}</span>
          ))}
        </div>
      </div>

      {/* Story body — full text, scrollable */}
      <div className="max-h-96 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-ink/90">
        {story.body}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2 border-t border-border bg-subtle/40 px-5 py-2.5 text-xs text-muted">
        <span className="badge bg-surface text-muted ring-1 ring-inset ring-border">{story.language.toUpperCase()}</span>
        <span>est {Math.ceil(story.body.split(' ').length / 2.5)}s</span>
        <span className="text-faint">·</span>
        <span className="font-mono tabular-nums text-ink">${(reel.costCents / 100).toFixed(2)}</span>
        <span>so far</span>
      </div>

      {/* Actions */}
      <div className="border-t border-border px-5 py-4">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <button onClick={() => setRejecting(true)} disabled={loading} className="btn-danger flex-1">
            Reject
          </button>
          <button onClick={handleApprove} disabled={loading} className="btn-accent flex-1">
            {loading ? 'Saving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
