'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChannelAvatar } from '@/components/ChannelAvatar'
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
  channelName: string
  channelAvatarKey: string | null
  remaining: number
  allPendingIds: string[]
}

export function ReviewCard({ reel, story, channelName, channelAvatarKey, allPendingIds }: ReviewCardProps) {
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
      <div className="card relative flex flex-col gap-4 overflow-hidden p-5">
        <span className="absolute inset-x-0 top-0 h-1 bg-brand" />
        <div>
          <h2 className="font-display text-xl font-700 -tracking-[0.02em] text-ink">Why reject?</h2>
          <p className="mt-1 text-[13px] text-muted">Pick a reason — it shapes the next take.</p>
        </div>
        <div className="grid gap-2">
          {REASON_CODES.map((r) => (
            <button
              key={r.code}
              onClick={() => handleReject(r.code)}
              disabled={loading}
              className="rounded-sm border border-border-mid bg-surface px-3.5 py-3 text-left text-sm font-600 text-ink transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-50"
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
    <div className="card relative flex flex-col overflow-hidden">
      {/* the brand edge — the queue's cards read as a stack */}
      <span className="absolute inset-x-0 top-0 h-1 bg-brand" />

      {/* Story header */}
      <div className="border-b border-border px-5 pb-4 pt-5">
        {channelName && (
          <div className="mb-3 flex items-center gap-2.5">
            <ChannelAvatar name={channelName} avatarKey={channelAvatarKey} className="h-6 w-6" textClass="text-[10px]" />
            <span className="truncate text-[13px] font-600 text-muted">{channelName}</span>
          </div>
        )}
        <h2 className="font-display text-xl font-700 -tracking-[0.02em] text-ink">{story.title}</h2>
        {story.logline && <p className="mt-1.5 text-sm leading-normal text-muted">{story.logline}</p>}
        {story.subgenreTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {story.subgenreTags.map((t) => (
              <span key={t} className="rounded-2xl bg-subtle-strong px-2.5 py-1 text-xs font-600 text-muted">{t}</span>
            ))}
          </div>
        )}
      </div>

      {/* Story body — full text, scrollable */}
      <div className="max-h-96 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-[15px] leading-[1.7] text-body">
        {story.body}
      </div>

      {/* Meta */}
      <div className="flex items-center gap-2.5 border-t border-border bg-subtle px-5 py-2.5 text-xs text-faint">
        <span className="mono-label">{story.language.toUpperCase()}</span>
        <span className="mono-value text-[11px] text-muted">{Math.ceil(story.body.split(' ').length / 2.5)}s</span>
        <span
          className="ml-auto mono-value text-[11px] text-muted"
          title="What this reel has cost to make so far"
        >
          ${(reel.costCents / 100).toFixed(2)}
        </span>
      </div>

      {/* Actions */}
      <div className="border-t border-border px-5 py-4">
        {error && <p className="mb-3 text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <button onClick={() => setRejecting(true)} disabled={loading} className="btn-danger flex-1 py-3.5">
            Reject
          </button>
          <button onClick={handleApprove} disabled={loading} className="btn-accent flex-[1.4] py-3.5 font-700">
            {loading ? 'Saving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
