'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Creates a reel for this channel and kicks off the pipeline. On the FIRST reel (promptMode) we ask
// how the channel should produce reels — "with reviews" (stop at the story / storyboard / spot-check
// gates) or "fully automated" (run end-to-end to a finished render). The choice is stored on the
// channel and reused for later reels (editable in Settings).
export function CreateReelButton({
  channelId,
  compact = false,
  promptMode = false,
}: {
  channelId: string
  compact?: boolean
  promptMode?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPrompt, setShowPrompt] = useState(false)

  async function create(generationMode?: 'review' | 'auto') {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pipeline/create-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, ...(generationMode ? { generationMode } : {}) }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not create reel')
      // Automated → nothing to review; go watch it build on the channel page. Otherwise → the review
      // queue to approve the story.
      router.push(generationMode === 'auto' ? `/channel/${channelId}` : '/review')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create reel')
      setLoading(false)
    }
  }

  function onClick() {
    if (promptMode) setShowPrompt(true)
    else void create() // later reels reuse the channel's stored mode
  }

  return (
    <div className={compact ? '' : 'flex flex-col items-center'}>
      <button onClick={onClick} disabled={loading} className={compact ? 'btn-secondary btn-sm' : 'btn-accent'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {loading ? 'Creating…' : 'Create reel'}
      </button>
      {error && !showPrompt && <p className="mt-2 text-xs text-danger">{error}</p>}

      {showPrompt && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !loading && setShowPrompt(false)}
        >
          <div className="card animate-fade-in w-full max-w-md p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-ink">How should we make reels for this channel?</h2>
            <p className="mt-1 text-sm text-muted">You can change this anytime in Settings.</p>
            <div className="mt-4 flex flex-col gap-2.5">
              <button
                type="button"
                disabled={loading}
                onClick={() => void create('review')}
                className="rounded-lg border border-border-strong p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">With reviews</span>
                  <span className="rounded-full bg-accent/10 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-accent">Recommended</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">You approve the story, edit the storyboard, and check the render before each reel is done.</span>
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void create('auto')}
                className="rounded-lg border border-border-strong p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-ink">Fully automated</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted">We run the whole reel end-to-end — story, visuals, voice, music, render — with no stops. You review the finished result before downloading.</span>
              </button>
            </div>
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={() => setShowPrompt(false)} disabled={loading} className="btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
