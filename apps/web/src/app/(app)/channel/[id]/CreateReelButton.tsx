'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

// Creates a reel and kicks off the pipeline. On the FIRST reel (promptMode) it shows ONE prefilled
// screen — write-it-for-me with reviews is the primed default; BYO script and fully-automated are
// quieter alternatives on the same screen. Later reels reuse the stored channelMode
// (auto → straight to channel; review → BYO-or-generate → Story Studio).
export function CreateReelButton({
  channelId,
  compact = false,
  promptMode = false,
  channelMode = 'review',
  savedScripts = [],
  storyboardCents,
  reelCapCents,
  isEbn = false,
}: {
  channelId: string
  compact?: boolean
  promptMode?: boolean
  channelMode?: 'review' | 'auto'
  /** Scripts on the channel shelf that no reel has claimed yet — one script, one reel. */
  savedScripts?: { id: string; title: string; source: string }[]
  /** Estimated spend to reach the storyboard gate, and the enforced ceiling for a whole reel. */
  storyboardCents?: number | undefined
  reelCapCents?: number | undefined
  /** Evidence-Based channel: ONE door — required source material, no seed/paste/saved/hands-off.
   *  (One production entrypoint per story mode — decision-log 2026-08-03-001.) */
  isEbn?: boolean
}) {
  // Setup leaves a script behind; on the first reel it's the obvious thing to shoot.
  const firstScript = savedScripts[0] ?? null
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState<'idle' | 'first' | 'byo'>('idle')
  const [showTextarea, setShowTextarea] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [byoText, setByoText] = useState('')
  const [seedText, setSeedText] = useState('')
  const [dossierText, setDossierText] = useState('')

  async function create(generationMode?: 'review' | 'auto') {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pipeline/create-reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          ...(generationMode ? { generationMode } : {}),
          ...(seedText.trim() ? { seed: seedText.trim() } : {}),
          // EBN: the story is built strictly from this material (the API rejects EBN reels without it).
          ...(isEbn && dossierText.trim() ? { dossier: dossierText.trim() } : {}),
        }),
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
      // The story is used as-is (no review stop) — go straight to the storyboard, which shows the build.
      router.push(`/storyboard/${json.reelId}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save script')
      setLoading(false)
    }
  }

  // Cash in a story from the shelf: it's linked, not copied. Ours stops for approval first; theirs
  // goes straight to the shoot (the route decides and tells us which).
  async function useSaved(storyId: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/pipeline/provide-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'Could not start the reel')
      router.push(json.status === 'story_review' ? '/review' : `/storyboard/${json.reelId}`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the reel')
      setLoading(false)
    }
  }

  function onClick() {
    if (promptMode) setStep('first')
    // EBN can never skip the modal: even hands-off channels need this reel's source material first.
    else if (channelMode === 'auto' && !isEbn) void create('auto')
    else setStep('byo')
  }

  function closeModal() {
    if (loading) return
    setStep('idle')
    setShowTextarea(false)
    setShowSaved(false)
    setByoText('')
    setSeedText('')
    setDossierText('')
    setError('')
  }

  const SavedScriptPicker = () => (
    <div className="rounded-lg border border-accent bg-accent-soft p-3">
      <p className="text-sm font-semibold text-ink">Pick a script</p>
      <div className="mt-2 max-h-56 divide-y divide-border-soft overflow-y-auto rounded-md border border-border-soft bg-surface">
        {savedScripts.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={loading}
            onClick={() => void useSaved(s.id)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-row-hover disabled:opacity-50"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.title}</span>
            <span className="badge flex-shrink-0 bg-subtle text-muted">{s.source === 'user' ? 'written by you' : 'written for you'}</span>
          </button>
        ))}
      </div>
    </div>
  )

  // Name the spend before the creator commits. Two stages, because that's the true shape of it: the
  // storyboard runs now, filming only after they approve it. The cap is enforced by the pipeline, so it's
  // the one number here that's a promise rather than an estimate.
  const CostNote = () =>
    storyboardCents === undefined ? null : (
      <p className="mt-3 text-xs leading-relaxed text-faint">
        We’ll storyboard it and shoot the stills — about {money(storyboardCents)}. Filming starts only after you
        approve the storyboard{reelCapCents !== undefined ? `, and a whole reel never goes past ${money(reelCapCents)}` : ''}.
      </p>
    )

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
            {isEbn ? (
              /* Evidence-Based: ONE door. The story is written strictly from what's pasted here — no topic
                 seed (the planner orders evidence, it doesn't explore), no paste/saved-script doors (an
                 outside script has no provenance), no hands-off (each reel needs its own material). */
              <>
                <h2 className="text-base font-semibold text-ink">{step === 'first' ? 'Your first reel' : 'New reel'}</h2>
                <p className="mt-1 text-sm text-muted">
                  This channel writes from your source material — every line of the story is drawn from what you
                  give it. You approve the script before the shoot starts.
                </p>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium text-muted">Source material</span>
                  <textarea
                    value={dossierText}
                    onChange={(e) => setDossierText(e.target.value)}
                    placeholder="Paste the records, articles, transcripts, or notes this reel should be built from…"
                    maxLength={20000}
                    autoFocus
                    className="input h-44 resize-y"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void create('review')}
                  disabled={loading || !dossierText.trim()}
                  className="btn-accent mt-4 w-full justify-center"
                >
                  {loading ? 'Working…' : step === 'first' ? 'Write my first story' : 'Write the story'}
                </button>
                <CostNote />
              </>
            ) : step === 'first' ? (
              <>
                <h2 className="text-base font-semibold text-ink">Your first reel</h2>
                {/* Setup already wrote them a script. Continue that story instead of restarting it — the
                    script they read and kept is the lowest-friction, highest-trust first production. */}
                {firstScript ? (
                  <>
                    <p className="mt-1 text-sm text-muted">
                      Start from “{firstScript.title}”, the script from your setup — or we&apos;ll write a new one.
                    </p>
                    <button
                      type="button"
                      onClick={() => void useSaved(firstScript.id)}
                      disabled={loading}
                      className="btn-accent mt-4 w-full justify-center"
                    >
                      {loading ? 'Starting…' : 'Use this script'}
                    </button>
                    <CostNote />
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted">We&apos;ll write an original story in your channel&apos;s voice. You approve the script before the shoot starts.</p>
                    <label className="mt-3 block">
                      <span className="mb-1 block text-xs font-medium text-muted">Got a topic in mind? Optional.</span>
                      <input
                        value={seedText}
                        onChange={(e) => setSeedText(e.target.value)}
                        placeholder="e.g. a night-shift guard at a closed mall…"
                        maxLength={500}
                        className="input"
                      />
                    </label>
                    <button type="button" onClick={() => void create('review')} disabled={loading} className="btn-accent mt-4 w-full justify-center">
                      {loading ? 'Working…' : 'Write my first story'}
                    </button>
                    <CostNote />
                  </>
                )}
                {showTextarea ? (
                  <div className="mt-3 rounded-lg border border-accent bg-accent-soft p-3">
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
                ) : showSaved ? (
                  <div className="mt-3">
                    <SavedScriptPicker />
                  </div>
                ) : (
                  <div className="mt-3 flex flex-col gap-1 text-xs text-muted">
                    {firstScript ? (
                      <>
                        <button type="button" onClick={() => void create('review')} disabled={loading} className="self-start font-medium text-accent hover:underline">
                          Write me a new story instead
                        </button>
                        {savedScripts.length > 1 && (
                          <button type="button" onClick={() => setShowSaved(true)} disabled={loading} className="self-start font-medium text-accent hover:underline">
                            Pick a different saved script
                          </button>
                        )}
                      </>
                    ) : (
                      savedScripts.length > 0 && (
                        <button type="button" onClick={() => setShowSaved(true)} disabled={loading} className="self-start font-medium text-accent hover:underline">
                          Use a script you already saved
                        </button>
                      )
                    )}
                    <button type="button" onClick={() => setShowTextarea(true)} disabled={loading} className="self-start font-medium text-accent hover:underline">
                      I have a script — paste it instead
                    </button>
                    <button type="button" onClick={() => void create('auto')} disabled={loading} className="self-start text-left hover:text-ink">
                      Prefer hands-off? <span className="font-medium">Make reels start to finish, no stops</span>
                      {reelCapCents !== undefined ? ` — up to ${money(reelCapCents)} a reel, no approval stops.` : '.'} You can change this anytime in Settings.
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-ink">Do you have a script for this reel?</h2>
                <p className="mt-1 text-sm text-muted">Bring your own, or we&apos;ll write one you can review.</p>
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-medium text-muted">Got a topic in mind? Optional.</span>
                  <input
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value)}
                    placeholder="e.g. a night-shift guard at a closed mall…"
                    maxLength={500}
                    className="input"
                  />
                </label>
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
                  {savedScripts.length > 0 &&
                    (showSaved ? (
                      <SavedScriptPicker />
                    ) : (
                      <OptionCard
                        title="Use a saved script"
                        desc={`${savedScripts.length === 1 ? '1 script' : `${savedScripts.length} scripts`} saved — turn one into this reel.`}
                        onClick={() => setShowSaved(true)}
                      />
                    ))}
                </div>
                <CostNote />
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
