'use client'
import type { CSSProperties } from 'react'
import { MOOD_TINT, type ChannelMood } from '@/lib/pipeline-phases'
import { StatusTicker } from './StatusTicker'

// Characterful, channel-themed story-loading view. A breathing tinted glow + flowing "thinking" bar +
// cycling status lines + live draft #/cost. Tint comes from the channel's mood (e.g. crimson for a horror
// channel). All motion degrades cleanly under the global prefers-reduced-motion guard.
export function StoryGenerating({
  mood,
  lines,
  draft = 0,
  costCents = 0,
  headline = 'Writing your story',
}: {
  mood: ChannelMood
  lines: string[]
  draft?: number
  costCents?: number
  headline?: string
}) {
  const tint = MOOD_TINT[mood]
  return (
    <div
      className="card flex flex-col items-center gap-5 px-6 py-16 text-center"
      style={{ ['--think-tint']: tint } as CSSProperties}
    >
      {/* Breathing tinted centerpiece */}
      <div className="relative flex h-16 w-16 items-center justify-center">
        <span className="animate-breathe absolute inset-0 rounded-full" style={{ background: tint, opacity: 0.16, filter: 'blur(10px)' }} />
        <span
          className="animate-breathe relative flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: `${tint}1a`, border: `1px solid ${tint}55` }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={tint} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </span>
      </div>

      <div>
        <p className="text-base font-semibold tracking-tight text-ink">
          {headline}
          {draft > 0 ? <span className="text-muted"> · draft {draft + 1}</span> : null}
        </p>
        <div className="mt-1.5 min-h-[1.25rem]">
          <StatusTicker lines={lines} className="text-sm text-muted" />
        </div>
      </div>

      {/* Flowing "thinking" bar */}
      <div className="h-1 w-48 overflow-hidden rounded-full bg-subtle">
        <div className="animate-think h-full w-full" />
      </div>

      <p className="text-[11px] text-faint">
        Usually a few seconds.
        {costCents > 0 ? (
          <>
            {' · '}
            <span className="font-mono tabular-nums">${(costCents / 100).toFixed(2)}</span> so far
          </>
        ) : null}
      </p>
    </div>
  )
}
