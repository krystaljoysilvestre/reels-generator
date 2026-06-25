'use client'
import type { CSSProperties } from 'react'
import { MOOD_TINT, type ChannelMood } from '@/lib/pipeline-phases'
import { GenreLoader } from './GenreLoader'
import { StatusTicker } from './StatusTicker'

// Characterful, channel-themed story-loading view. A breathing tinted glow + flowing "thinking" bar +
// cycling status lines + live draft #/cost. Tint comes from the channel's mood (e.g. crimson for a horror
// channel). All motion degrades cleanly under the global prefers-reduced-motion guard.
export function StoryGenerating({
  mood,
  genre,
  lines,
  draft = 0,
  costCents = 0,
  headline = 'Writing your story',
}: {
  mood: ChannelMood
  genre?: string | undefined
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
      {/* Genre-themed centerpiece (ghost for horror, etc.) tinted by the channel mood */}
      <GenreLoader genre={genre} tint={tint} size={64} />

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
