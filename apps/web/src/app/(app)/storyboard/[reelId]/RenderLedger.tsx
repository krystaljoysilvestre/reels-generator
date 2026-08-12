'use client'
import { baseStepName } from '@reels/core'

// ── The render, step by step ─────────────────────────────────────────────────────
// The moment after "Render reel" (Storyboard v3): the reel being worked on, beside a ledger of the actual
// work. It also LOCKS the editor — a scene edited halfway through a render wouldn't be in the cut, so
// editing is paused while this is up, and this overlay is the lock.
//
// Every row is a REAL pipeline step, read from pipeline_steps via /api/pipeline/status. The labels are
// creator-facing ("Filming scenes", not "generate_images"), the notes are facts about this reel, and the
// spend is what the reel has actually cost so far. Nothing here is on a timer.
//
// There is no Cancel: the render chain has no cancel path (no route, no worker signal), and a button that
// abandons nothing would be the worst kind of control. If that lands, this is where it goes.

// The render chain's steps, in order, with the words a creator would use for them. Keys are the canonical
// step names — a fan-out step's rows (`generate_images:scene3`) collapse onto its base name.
const LEDGER: Array<{ key: string; label: string }> = [
  { key: 'generate_images', label: 'Filming scenes' },
  { key: 'generate_tts', label: 'Recording voiceover' },
  { key: 'compute_timings', label: 'Syncing captions to voice' },
  { key: 'generate_sfx', label: 'Layering sound effects' },
  { key: 'animate_scenes', label: 'Animating motion' },
  { key: 'generate_music', label: 'Scoring the music bed' },
  { key: 'mix_audio', label: 'Mixing audio' },
  { key: 'rank_cover_frames', label: 'Choosing your cover' },
  { key: 'render', label: 'Rendering the final cut' },
  { key: 'render_qa', label: 'Running quality checks' },
]

type StepState = 'done' | 'running' | 'failed' | 'skipped' | 'pending'

export function RenderLedger({
  steps, costCents, title, sceneCount, motionCount, voiceName, renderSize, previewUrl, moodTint,
}: {
  steps: Array<{ stepName: string; status: string }>
  costCents: number
  title: string
  sceneCount: number
  motionCount: number
  voiceName: string
  /** The channel's real output size, e.g. "1080×1920". */
  renderSize: string
  /** The frame to show beside the ledger — the scene being worked on, else the reel's first. */
  previewUrl?: string | undefined
  moodTint: string
}) {
  // Collapse the fan-out rows onto their canonical step, keeping the strongest signal per step: a step is
  // running if any of its rows is, failed if any failed, done only when it has rows and none are pending.
  const byStep = new Map<string, string[]>()
  for (const s of steps) {
    const base = baseStepName(s.stepName)
    byStep.set(base, [...(byStep.get(base) ?? []), s.status])
  }
  const stateOf = (key: string): StepState => {
    const rows = byStep.get(key)
    if (!rows || rows.length === 0) return 'pending'
    if (rows.includes('failed')) return 'failed'
    if (rows.includes('running')) return 'running'
    if (rows.every((r) => r === 'done')) return 'done'
    return 'running'
  }
  // How far the chain has got — the last step with any row at all.
  const lastTouched = LEDGER.reduce((acc, s, i) => (byStep.has(s.key) ? i : acc), -1)

  const rows = LEDGER.map((s, i) => {
    let state = stateOf(s.key)
    // A step the chain has already passed with no row of its own never ran for this reel (no motion scenes
    // → no animate_scenes; a channel with music off → no generate_music). Say "skipped", don't imply it's
    // still coming.
    if (state === 'pending' && i < lastTouched) state = 'skipped'
    const note =
      s.key === 'generate_images' ? `${sceneCount} ${sceneCount === 1 ? 'shot' : 'shots'}`
        : s.key === 'generate_tts' ? voiceName
          : s.key === 'animate_scenes' ? (motionCount > 0 ? `${motionCount} ${motionCount === 1 ? 'clip' : 'clips'}` : '')
            : s.key === 'render' ? renderSize
              : ''
    return { ...s, state, note }
  })

  const done = rows.filter((r) => r.state === 'done' || r.state === 'skipped').length
  const pct = Math.round((done / rows.length) * 100)
  const stepNum = Math.min(done + 1, rows.length)

  return (
    <div
      className="animate-fade-in absolute inset-0 z-40 flex items-center justify-center overflow-y-auto p-6 sm:p-7"
      style={{ background: 'radial-gradient(1100px 700px at 50% -8%, #161022, #0A0713 70%)' }}
      role="status"
      aria-live="polite"
    >
      <div className="flex w-full max-w-[720px] flex-col items-stretch gap-6 sm:flex-row sm:gap-[26px]">
        {/* The reel, being made. */}
        <div className="relative mx-auto w-[168px] flex-shrink-0 sm:mx-0 sm:w-[212px]">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-5 rounded-[3rem] opacity-30 blur-2xl"
            style={{ background: `radial-gradient(60% 55% at 50% 42%, ${moodTint}, transparent 72%)` }}
          />
          <div className="relative aspect-[9/16] overflow-hidden rounded-[18px] bg-night-plum shadow-[0_24px_60px_-18px_rgba(0,0,0,0.6)]">
            {previewUrl && <img src={previewUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />}
            <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.16),transparent_55%)]" />
            {/* A light sweeping across the frame — the one piece of pure motion, saying work is happening. */}
            <span
              aria-hidden
              className="animate-shimmer absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.22)_50%,transparent_70%)] bg-[length:220%_100%]"
            />
          </div>
        </div>

        {/* The ledger. */}
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="inline-flex items-center gap-2 self-start rounded-2xl border border-accent/30 bg-accent/[0.14] px-3 py-1.5">
            <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-night-live shadow-[0_0_8px_#C77DFF]" aria-hidden />
            <span className="font-mono text-[11px] font-700 tracking-[0.06em] text-[#D4B3FF]">RENDERING</span>
          </span>
          <h2 className="mt-3 text-xl font-800 -tracking-[0.01em] text-night-ink">Building your reel</h2>
          <p className="mt-0.5 text-[12.5px] text-night-muted">Filming, scoring, and cutting “{title}”.</p>

          <div className="mb-4 mt-4 h-1.5 overflow-hidden rounded-sm bg-white/[0.08]">
            <div className="h-full rounded-sm bg-brand-3 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>

          <ol className="flex flex-1 flex-col gap-0.5">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2.5 py-1.5">
                <span
                  className={`inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] ${
                    r.state === 'done' || r.state === 'skipped' ? 'border-accent bg-accent'
                      : r.state === 'failed' ? 'border-night-danger bg-night-danger/20'
                        : r.state === 'running' ? 'border-accent bg-accent/20'
                          : 'border-white/[0.14] bg-white/[0.04]'
                  }`}
                  aria-hidden
                >
                  {(r.state === 'done' || r.state === 'skipped') && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                  )}
                  {r.state === 'running' && (
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                  )}
                  {r.state === 'failed' && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF9C8A" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  )}
                </span>
                <span
                  className={`text-[13.5px] ${
                    r.state === 'running' ? 'font-700 text-night-ink'
                      : r.state === 'done' ? 'font-500 text-night-lilac'
                        : r.state === 'failed' ? 'font-600 text-night-danger'
                          : 'font-500 text-night-pending'
                  }`}
                >
                  {r.label}
                </span>
                {r.note && r.state !== 'skipped' && <span className="font-mono text-[11px] text-[#6E6785]">{r.note}</span>}
                {r.state === 'skipped' && <span className="font-mono text-[11px] text-night-pending">not needed</span>}
                <span className="flex-1" />
                {r.state === 'running' && <span className="font-mono text-[11px] text-night-live">working…</span>}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-night-seam pt-3.5">
            <span className="text-xs text-night-gutter">
              Step {stepNum}/{rows.length} · <span key={costCents} className="animate-value-flash font-mono text-night-lilac">${(costCents / 100).toFixed(2)} so far</span>
            </span>
            <span className="flex-1" />
            <span className="flex items-center gap-1.5 text-[11px] text-night-gutter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              You can make changes once the cut is done.
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
