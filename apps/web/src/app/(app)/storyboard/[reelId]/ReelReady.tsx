'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PostMeta } from '@reels/core'
import { useToast } from '@/components/Toast'
import { displayDurationSeconds, fmtClock } from './scene-timing'

// ── Your reel is ready ───────────────────────────────────────────────────────────
// The screen the render lands on (Storyboard v3). It replaces a sticky action bar under the editor, and
// the reason is the question this surface asks: *would you publish this?* A bar an inch tall, under a
// storyboard still showing edit controls, asked it in a whisper. Here the reel plays at full height with
// the package beside it — the title and cover a viewer meets first, what the reel is made of, what it
// cost — and the actions read in the order the decision is made.
//
// It is a VIEW of the same reel, not a stage of its own: "Back to editing" returns to the storyboard, and
// re-rendering from here comes straight back.
//
// Two figures the design asked for aren't drawn, because the app has nothing true to put there:
// "credits used" (there is no credit system — the reel's real spend takes that row) and a bare "Publish
// reel" (publishing is gated on approval, and where it goes depends on which platform is connected, so
// the primary action is whatever this reel's next real step is).
export function ReelReady({
  reelId, channelId, status, title, renderUrl, coverUrl, sceneCount, estSecs, timedSecs, voiceName, musicName, costCents,
  qa, scheduledAt, metricsViews, postMeta, onBack, onRerender, onApprove, onPublish, loading, error,
  coverPicker, publishTools, destinations,
}: {
  reelId: string
  channelId: string
  status: string
  /** The platform title if the package has one, else the story's working title. */
  title: string
  renderUrl: string | null
  coverUrl: string | null
  sceneCount: number
  /** Estimated runtime, until the finished video reports its real one. */
  estSecs: number
  /** Persisted render clock from compute_timings; null before a reel has timing data. */
  timedSecs: number | null
  voiceName: string
  musicName: string
  costCents: number
  /** Did the automated render checks pass? null = they didn't run for this reel. */
  qa: 'passed' | 'failed' | null
  scheduledAt: string | null
  metricsViews: number | null
  postMeta: PostMeta | null
  onBack: () => void
  onRerender: () => void
  onApprove: () => void
  onPublish: () => void
  loading: string | null
  error: string | null
  /** The cover picker (owns its own modal). */
  coverPicker: React.ReactNode
  /** Post caption / YouTube / log-performance tools for this state. */
  publishTools: React.ReactNode
  destinations: Array<{ target: string; connected: boolean; accountName: string | null }>
}) {
  // The finished video's real duration once the browser reads it; persisted render timing keeps the
  // summary truthful before that event, with the storyboard estimate reserved for unrendered reels.
  const [realSecs, setRealSecs] = useState<number | null>(null)
  const duration = fmtClock(displayDurationSeconds(realSecs, timedSecs, estSecs))

  const isSpotCheck = status === 'spot_check'
  const isApproved = status === 'approved'
  const isOut = status === 'published' || status === 'scheduled'
  const ytDestination = destinations.find((d) => d.target === 'youtube_shorts' || d.target === 'youtube_long')

  return (
    <div
      className="animate-fade-in absolute inset-0 z-40 flex flex-col"
      style={{ background: 'radial-gradient(1100px 700px at 50% -8%, #161022, #0A0713 70%)' }}
    >
      {/* Header — what happened, and the way back. */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-night-seam px-5 py-4 sm:px-7">
        <span
          className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-1.5 ${
            qa === 'failed' ? 'border-night-danger/30 bg-night-danger/[0.12]' : 'border-night-success-border bg-night-success-bg'
          }`}
        >
          {qa === 'failed' ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF9C8A" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#33D69F" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12 5 5L20 7" /></svg>
          )}
          <span className={`font-mono text-[11px] font-700 tracking-[0.04em] ${qa === 'failed' ? 'text-night-danger' : 'text-[#8FE9C9]'}`}>
            RENDER COMPLETE
          </span>
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-800 -tracking-[0.01em] text-night-ink">
            {isOut ? (status === 'scheduled' ? 'Your reel is scheduled' : 'Your reel is published') : isApproved ? 'Ready to post' : 'Your reel is ready'}
          </h2>
          <p className="mt-0.5 truncate text-xs text-night-muted">
            {isOut && status === 'scheduled' && scheduledAt
              ? `Uploaded and waiting — goes live ${new Date(scheduledAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.`
              : isApproved
                ? 'Your post package is ready — post it, then mark it published.'
                : `“${title}” · ${qa === 'failed' ? 'the automated checks flagged something — give it a watch.' : qa === 'passed' ? 'passed automated quality checks.' : 'give it a watch before you decide.'}`}
          </p>
        </div>
        <div className="flex-1" />
        <button onClick={onBack} className="btn-dark flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 18-6-6 6-6" /></svg>
          Back to editing
        </button>
      </div>

      {/* The reel, and its package. */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-7 overflow-y-auto p-6 lg:flex-row lg:items-center lg:justify-center lg:gap-[38px] lg:p-7">
        <div className="relative w-full max-w-[292px] flex-shrink-0 lg:h-full lg:max-h-[520px] lg:w-auto">
          {renderUrl ? (
            <video
              key={renderUrl}
              src={renderUrl}
              controls
              playsInline
              onLoadedMetadata={(e) => setRealSecs(e.currentTarget.duration)}
              className="h-full w-full rounded-[20px] shadow-[0_30px_70px_-22px_rgba(0,0,0,0.7)]"
              style={{ aspectRatio: '9/16' }}
            />
          ) : (
            <div className="flex aspect-[9/16] items-center justify-center rounded-[20px] border border-white/10 bg-night-plum text-xs text-night-muted">
              The cut isn’t available yet.
            </div>
          )}
        </div>

        <div className="flex w-full max-w-[340px] flex-shrink-0 flex-col gap-4 lg:w-[320px]">
          {/* POST DETAILS — the title and cover a viewer meets before pressing play. Editable here because
              this is where "would you publish this?" gets answered. */}
          <div>
            <p className="mb-2.5 font-mono text-[11px] font-700 uppercase tracking-micro text-[#6E6785]">Post details</p>
            {coverUrl && (
              <div className="mb-3 flex items-center gap-3">
                <img src={coverUrl} alt="Cover" className="h-16 w-auto flex-shrink-0 rounded-lg border border-white/10 object-contain" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-night-muted">Your cover — the frame people meet first.</p>
                  <div className="mt-1.5">{coverPicker}</div>
                </div>
              </div>
            )}
            <PostFields reelId={reelId} initial={postMeta} />
          </div>

          {/* SUMMARY — what the reel is, and what it cost. */}
          <div>
            <p className="mb-2.5 font-mono text-[11px] font-700 uppercase tracking-micro text-[#6E6785]">Summary</p>
            <dl className="flex flex-col gap-2.5">
              <SummaryRow label="Duration" value={duration} mono />
              <SummaryRow label="Scenes" value={String(sceneCount)} mono />
              <SummaryRow label="Voice · music" value={`${voiceName || '—'} · ${musicName}`} />
              <SummaryRow label="Spend" value={`$${(costCents / 100).toFixed(2)}`} mono />
              {metricsViews != null && <SummaryRow label="Views logged" value={metricsViews.toLocaleString()} mono />}
            </dl>
          </div>

          {qa && (
            <p
              className={`flex items-start gap-2 rounded-[11px] border px-3 py-2.5 text-[11.5px] leading-snug ${
                qa === 'passed'
                  ? 'border-night-success-border bg-night-success-bg text-night-success-body'
                  : 'border-night-danger/25 bg-night-danger/[0.08] text-night-danger'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-shrink-0" aria-hidden>
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="m9 11 3 3L22 4" />
              </svg>
              {qa === 'passed'
                ? 'Quality checks passed — captions synced, nothing unsafe in frame.'
                : 'The automated checks flagged something. Watch it through before you post.'}
            </p>
          )}

          {isApproved && destinations.length > 0 && (
            <p className="text-[11px] leading-relaxed text-night-gutter">
              Going to {destinations.map((d) => {
                const label = d.target === 'tiktok' ? 'TikTok' : d.target === 'facebook_reels' ? 'Facebook Reels' : 'YouTube'
                return `${label}${d.connected && d.accountName ? ` · ${d.accountName}` : ''}`
              }).join('  ·  ')}
            </p>
          )}

          {/* ACTIONS — the reel's next real step first, then the ways around it. */}
          <div className="flex flex-col gap-2.5">
            {isSpotCheck && (
              <button onClick={onApprove} disabled={loading === 'approve' || loading === 'render'} className="btn-primary btn-glow w-full py-3.5 text-sm">
                {loading === 'approve' ? 'Approving…' : (
                  <>
                    Approve reel
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                  </>
                )}
              </button>
            )}
            {isApproved && ytDestination && !ytDestination.connected && (
              <a href={`/channel/${channelId}/settings`} className="btn-primary btn-glow w-full py-3.5 text-sm">
                Connect YouTube
              </a>
            )}
            {isApproved && (
              <button onClick={onPublish} disabled={loading === 'publish'} className="btn-primary btn-glow w-full py-3.5 text-sm">
                {loading === 'publish' ? 'Publishing…' : 'Mark as published'}
              </button>
            )}

            <div className="flex flex-wrap gap-2.5 [&>*]:flex-1">
              {renderUrl && (
                <a href={`/api/pipeline/export-post-package?reelId=${reelId}`} className="btn-dark">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
                  Download
                </a>
              )}
              {!isOut && (
                <button onClick={onRerender} disabled={loading === 'render' || loading === 'approve'} className="btn-dark">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15" /></svg>
                  {loading === 'render' ? 'Queuing…' : 'Re-render'}
                </button>
              )}
            </div>
            {/* Post caption (the full package), YouTube upload, log performance — per state. */}
            <div className="flex flex-wrap gap-2.5 [&>*]:flex-1">{publishTools}</div>
            {error && <p className="text-xs text-night-danger">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <dt className="flex-shrink-0 text-night-muted">{label}</dt>
      <dd className={`truncate text-right text-night-ink ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</dd>
    </div>
  )
}

// Title + caption, inline. These two are what a viewer actually reads, so they're editable right here
// rather than behind a modal; the rest of the package (thumbnail words, hook, hashtags) stays in the Post
// caption dialog. Saves the WHOLE PostMeta object because that's what the route validates — editing the
// title also rebuilds the cover when the thumbnail text falls back to it.
function PostFields({ reelId, initial }: { reelId: string; initial: PostMeta | null }) {
  const { toast } = useToast()
  const router = useRouter()
  const [meta, setMeta] = useState<PostMeta | null>(initial)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setMeta(initial); setDirty(false) }, [initial])

  if (!meta) {
    return <p className="text-[11px] leading-relaxed text-night-gutter">No post package yet — it’s written when the story is approved.</p>
  }

  async function save() {
    if (!meta) return
    setSaving(true)
    const res = await fetch('/api/pipeline/post-meta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reelId, postMeta: meta }),
    })
    setSaving(false)
    if (!res.ok) { toast('Could not save — try again.', 'error'); return }
    setDirty(false)
    const body = (await res.json().catch(() => null)) as { coverRebuilding?: boolean } | null
    if (body?.coverRebuilding) {
      toast('Saved — updating your cover.', 'success')
      setTimeout(() => router.refresh(), 6000)
    } else {
      toast('Saved.', 'success')
      router.refresh()
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-600 text-[#9A93AC]">Title</span>
        <input
          value={meta.title}
          maxLength={120}
          onChange={(e) => { setMeta({ ...meta, title: e.target.value }); setDirty(true) }}
          className="input-dark font-600"
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-[11px] font-600 text-[#9A93AC]">Caption</span>
        <textarea
          value={meta.caption}
          maxLength={2200}
          rows={5}
          onChange={(e) => { setMeta({ ...meta, caption: e.target.value }); setDirty(true) }}
          className="input-dark resize-y overflow-y-auto text-[12.5px] leading-relaxed"
        />
      </label>
      {dirty && (
        <button onClick={() => void save()} disabled={saving} className="btn-dark self-start px-3 py-1.5 text-xs">
          {saving ? 'Saving…' : 'Save details'}
        </button>
      )}
    </div>
  )
}
