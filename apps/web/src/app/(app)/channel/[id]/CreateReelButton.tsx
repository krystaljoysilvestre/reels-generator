'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Creates a reel and kicks off the pipeline. On the FIRST reel (promptMode) it asks the channel's
// generation mode (review vs fully automated); in review mode it then asks BYO-or-generate and routes
// into the per-reel Story Studio. Auto-mode runs end-to-end → channel page. Later reels reuse the stored
// channelMode (auto → straight to channel; review → BYO-or-generate → Story Studio).
export function CreateReelButton({
  channelId,
  compact = false,
  promptMode = false,
  channelMode = 'review',
}: {
  channelId: string
  compact?: boolean
  promptMode?: boolean
  channelMode?: 'review' | 'auto'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'idle' | 'mode' | 'byo'>('idle')
  const [showTextarea, setShowTextarea] = useState(false)
  const [byoText, setByoText] = useState('')

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
      router.push(generationMode === 'auto' ? `/channel/${channelId}` : `/reel/${json.reelId}/story`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create reel')
      setLoading(false)
    }
  }

  async function createBYO() {
    if (!byoText.trim()) {
      setError('Paste your script first.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pipeline/provide-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId, body: byoText.trim() }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not save script')
      router.push(`/reel/${json.reelId}/story`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save script')
      setLoading(false)
    }
  }

  function onClick() {
    if (promptMode) setStep('mode')
    else if (channelMode === 'auto') void create('auto')
    else setStep('byo')
  }

  function closeModal() {
    if (loading) return
    setStep('idle')
    setShowTextarea(false)
    setByoText('')
    setError('')
  }

  const OptionCard = ({ title, badge, desc, onClick: onPick }: { title: string; badge?: string; desc: string; onClick: () => void }) => (
    <button
      type="button"
      disabled={loading}
      onClick={onPick}
      className="rounded-lg border border-border-strong p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
    >
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-ink">{title}</span>
        {badge && <span className="rounded-full bg-accent/10 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-accent">{badge}</span>}
      </span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">{desc}</span>
    </button>
  )

  return (
    <div className={compact ? '' : 'flex flex-col items-center'}>
      <button onClick={onClick} disabled={loading} className={compact ? 'btn-secondary btn-sm' : 'btn-accent'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        {loading ? 'Creating…' : 'Create reel'}
      </button>
      {error && step === 'idle' && <p className="mt-2 text-xs text-danger">{error}</p>}

      {step !== 'idle' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={closeModal}>
          <div className="card animate-fade-in w-full max-w-md p-6 text-left" onClick={(e) => e.stopPropagation()}>
            {step === 'mode' ? (
              <>
                <h2 className="text-base font-semibold text-ink">How should we make reels for this channel?</h2>
                <p className="mt-1 text-sm text-muted">You can change this anytime in Settings.</p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <OptionCard title="With reviews" badge="Recommended" desc="You approve the story, edit the storyboard, and check the render before each reel is done." onClick={() => setStep('byo')} />
                  <OptionCard title="Fully automated" desc="We make the whole reel — story, visuals, voice, and music — start to finish, no stops. You review the finished result before downloading." onClick={() => void create('auto')} />
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-ink">Do you have a script for this reel?</h2>
                <p className="mt-1 text-sm text-muted">Bring your own, or we&apos;ll write one you can review.</p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <OptionCard title="Write it for me" badge="Recommended" desc="We draft an original story in your channel's voice — you review it next, and can rewrite it if it's not right." onClick={() => void create('review')} />
                  {showTextarea ? (
                    <div className="rounded-lg border border-accent bg-accent-soft p-3">
                      <p className="text-sm font-semibold text-ink">Paste your script</p>
                      <textarea
                        value={byoText}
                        onChange={(e) => setByoText(e.target.value)}
                        placeholder="Paste the narration exactly as you want it spoken…"
                        autoFocus
                        className="input mt-2 h-40 resize-y"
                      />
                      <button type="button" onClick={() => void createBYO()} disabled={loading} className="btn-accent btn-sm mt-2">
                        {loading ? 'Saving…' : 'Use this script'}
                      </button>
                    </div>
                  ) : (
                    <OptionCard title="I have a script" desc="Paste your own narration — we'll take it straight to the storyboard." onClick={() => setShowTextarea(true)} />
                  )}
                </div>
              </>
            )}
            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={closeModal} disabled={loading} className="btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
