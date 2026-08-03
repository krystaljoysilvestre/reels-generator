'use client'
import { phaseProgress, phaseTicker } from '@/lib/pipeline-phases'
import { StatusTicker } from './StatusTicker'

// A 5-phase progress strip (Writing → Storyboarding → Filming → Scoring → Finishing) for the live build /
// render view. Active phase is filled; finished phases are soft; pending are faint. A ticker shows what's
// happening, plus optional "X of Y scenes" while images generate.
export function PipelinePhaseStepper({
  reelStatus,
  steps,
  genre,
  sceneProgress,
}: {
  reelStatus: string
  steps: Array<{ stepName: string; status: string }>
  /** Channel genre — picks the register of the ticker copy. Omitted falls back to neutral craft language. */
  genre?: string | undefined
  sceneProgress?: { done: number; total: number } | undefined
}) {
  const { phases, currentPhase } = phaseProgress(reelStatus, steps)

  return (
    <div className="flex-shrink-0 border-b border-border bg-subtle/30 px-8 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {phases.map((p) => (
            <span
              key={p.key}
              className={`badge ${
                p.state === 'active'
                  ? 'bg-accent text-white'
                  : p.state === 'done'
                    ? 'bg-accent-soft text-accent'
                    : 'bg-subtle text-faint'
              }`}
            >
              {p.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin text-accent" aria-hidden>
            <path d="M21 12a9 9 0 1 1-6.22-8.56" />
          </svg>
          <StatusTicker lines={phaseTicker(currentPhase, genre)} className="text-xs text-muted" />
          {sceneProgress && sceneProgress.total > 0 && (
            <span className="font-mono tabular-nums text-faint">· {sceneProgress.done}/{sceneProgress.total} scenes</span>
          )}
        </div>
      </div>
    </div>
  )
}
