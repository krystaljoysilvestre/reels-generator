'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

// Scripts on evidence-required channels are notes/voice references only; production starts from sources.
// Elsewhere there are two ways onto the shelf: write it yourself, or have one written in this channel's voice.
export function AddScriptButton({ channelId, requiresSources, prominent = false }: { channelId: string; requiresSources: boolean; prominent?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'pick' | 'write' | 'generate'>('pick')
  const [text, setText] = useState('')
  const [idea, setIdea] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function post(url: string, payload: unknown, fallbackError: string) {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? fallbackError)
      close()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : fallbackError)
      setBusy(false)
    }
  }

  function close() {
    setOpen(false)
    setMode('pick')
    setText('')
    setIdea('')
    setBusy(false)
    setError('')
  }

  const OptionCard = ({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) => (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="rounded-lg border border-border-strong p-4 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
    >
      <span className="text-sm font-semibold text-ink">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">{desc}</span>
    </button>
  )

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={prominent ? 'btn-accent' : 'btn-secondary btn-sm'}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
        Add script
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={() => !busy && close()}>
          <div className="card animate-fade-in w-full max-w-md p-6 text-left" onClick={(e) => e.stopPropagation()}>
            {mode === 'pick' && (
              <>
                <h2 className="text-base font-semibold text-ink">Add a script</h2>
                <p className="mt-1 text-sm text-muted">
                  {requiresSources ? 'Save a note or voice reference for later.' : 'Save it now, make the reel whenever you&apos;re ready.'}
                </p>
                <div className="mt-4 flex flex-col gap-2.5">
                  <OptionCard title="Write it yourself" desc="Paste or type your narration — we'll save it, nothing gets made yet." onClick={() => setMode('write')} />
                  {!requiresSources && (
                    <OptionCard title="Write it for me" desc="An original script in this channel's voice. A few cents; no reel until you say so." onClick={() => setMode('generate')} />
                  )}
                </div>
                {requiresSources && (
                  <p className="mt-3 text-xs text-muted">
                    This channel writes from your source material — start a reel and add it there.
                  </p>
                )}
              </>
            )}

            {mode === 'write' && (
              <>
                <h2 className="text-base font-semibold text-ink">Your script</h2>
                <p className="mt-1 text-sm text-muted">The narration, exactly as you want it spoken.</p>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Paste the narration exactly as you want it spoken…"
                  autoFocus
                  maxLength={20000}
                  className="input mt-3 h-56 resize-y"
                />
                <button
                  type="button"
                  onClick={() => (text.trim() ? void post('/api/story/create', { channelId, body: text.trim() }, 'Couldn’t save that — try again.') : setError('Add some words first.'))}
                  disabled={busy}
                  className="btn-accent mt-3 w-full justify-center"
                >
                  {busy ? 'Saving…' : 'Save script'}
                </button>
              </>
            )}

            {mode === 'generate' && (
              <>
                <h2 className="text-base font-semibold text-ink">We&apos;ll write it</h2>
                <p className="mt-1 text-sm text-muted">An original script in this channel&apos;s voice. Read it, edit it, keep it — nothing gets made until you make a reel.</p>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium text-muted">Got an idea in mind? Optional.</span>
                  <input
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="e.g. a night-shift guard at a closed mall…"
                    maxLength={8000}
                    className="input"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void post('/api/story/generate', { channelId, ...(idea.trim() ? { idea: idea.trim() } : {}) }, 'Couldn’t write that one — try again.')}
                  disabled={busy}
                  className="btn-accent mt-4 w-full justify-center"
                >
                  {busy ? 'Writing…' : 'Write it'}
                </button>
                <p className="mt-2 text-center text-xs text-faint">A few cents per script.</p>
              </>
            )}

            {error && <p className="mt-3 text-xs text-danger">{error}</p>}
            <div className="mt-4 flex justify-between">
              {mode === 'pick' ? (
                <span />
              ) : (
                <button type="button" onClick={() => { setMode('pick'); setError('') }} disabled={busy} className="btn-ghost btn-sm">
                  Back
                </button>
              )}
              <button type="button" onClick={close} disabled={busy} className="btn-ghost btn-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
