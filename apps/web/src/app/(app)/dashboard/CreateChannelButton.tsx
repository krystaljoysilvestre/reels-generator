'use client'
import Link from 'next/link'
import { warmTrendingNiches } from '@/lib/trending-niches'

// `label` lets the empty-state hero say "Create your first channel" while the header keeps the
// shorter "New channel" — same destination, same intent-warming click.
export function CreateChannelButton({
  variant = 'cta',
  label = 'New channel',
  className = 'btn-md btn-glow',
}: {
  variant?: 'cta' | 'tile'
  label?: string
  /** Extra button classes — the empty-state hero uses `btn-lg btn-glow` for the front-door scale. */
  className?: string
}) {
  // The click is the moment of intent — start fetching the wizard's "Trending now" rail here, so
  // the data races the navigation instead of waiting for the wizard to mount.
  if (variant === 'tile') {
    return (
      <Link
        href="/channel/new"
        onClick={warmTrendingNiches}
        className="group flex flex-col items-center justify-center text-center"
      >
        <span className="mb-2.5 flex h-10 w-10 items-center justify-center rounded-md bg-brand-wash transition-transform group-hover:scale-105">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9B3BFF" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
        <span className="text-[13px] font-600 text-muted group-hover:text-ink">New channel</span>
      </Link>
    )
  }

  return (
    <Link href="/channel/new" onClick={warmTrendingNiches} className={`btn-primary ${className}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </Link>
  )
}
