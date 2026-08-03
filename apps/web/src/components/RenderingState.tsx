'use client'
import type { CSSProperties } from 'react'
import { MOOD_TINT, phaseProgress, phaseTicker, type ChannelMood } from '@/lib/pipeline-phases'
import { GenreLoader } from './GenreLoader'
import { StatusTicker } from './StatusTicker'

// The "your reel is rendering" moment for the storyboard. Sits over the (locked) editor as a mood-tinted,
// blurred scrim with the channel's GenreLoader glyph, a phase journey, cycling in-character status copy,
// and scene readiness. Shown only while the render chain runs — editing is intentionally paused, so this
// doubles as the lock. Decorative motion degrades under the global prefers-reduced-motion guard.
export function RenderingState({
  reelStatus,
  steps,
  mood,
  genre,
  sceneProgress,
  headline = 'Rolling your reel',
}: {
  reelStatus: string
  steps: Array<{ stepName: string; status: string }>
  mood: ChannelMood
  genre?: string | undefined
  sceneProgress?: { done: number; total: number } | undefined
  headline?: string
}) {
  const tint = MOOD_TINT[mood]
  const { phases, currentPhase } = phaseProgress(reelStatus, steps)
  const pct = sceneProgress && sceneProgress.total > 0 ? Math.round((100 * sceneProgress.done) / sceneProgress.total) : null

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center px-6"
      style={{ ['--think-tint']: tint } as CSSProperties}
      role="status"
      aria-live="polite"
    >
      {/* Blur + darken the storyboard behind, so the render reads as a distinct, focused moment. */}
      <div className="absolute inset-0 bg-bg/75 backdrop-blur-[3px]" aria-hidden />
      {/* Slow mood-tinted breath of light behind the card. */}
      <div
        className="animate-breathe pointer-events-none absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `radial-gradient(circle, ${tint}26, transparent 68%)` }}
        aria-hidden
      />

      <div className="card animate-pop-in relative z-10 flex w-full max-w-md flex-col items-center gap-6 px-8 py-12 text-center">
        <GenreLoader genre={genre} tint={tint} size={76} />

        <div>
          <p className="text-lg font-semibold tracking-tight text-ink">{headline}</p>
          <div className="mt-1.5 min-h-[1.25rem]">
            <StatusTicker lines={phaseTicker(currentPhase, genre)} className="text-sm text-muted" />
          </div>
        </div>

        {/* Phase journey — the active phase glows in the channel's mood tint. */}
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {phases.map((p) => (
            <span
              key={p.key}
              className={`badge ${
                p.state === 'active'
                  ? 'animate-glow bg-accent text-white'
                  : p.state === 'done'
                    ? 'bg-accent-soft text-accent'
                    : 'bg-subtle text-faint'
              }`}
              style={p.state === 'active' ? ({ ['--glow-tint']: tint } as CSSProperties) : undefined}
            >
              {p.label}
            </span>
          ))}
        </div>

        {pct !== null && (
          <div className="w-full">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1.5 font-mono text-[11px] tabular-nums text-faint">
              {sceneProgress!.done}/{sceneProgress!.total} scenes ready
            </p>
          </div>
        )}

        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Editing is paused while your reel renders.
        </p>
      </div>
    </div>
  )
}
