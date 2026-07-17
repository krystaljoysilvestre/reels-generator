'use client'
import Link from 'next/link'
import { warmTrendingNiches } from '@/lib/trending-niches'

export function CreateChannelButton() {
  return (
    // The click is the moment of intent — start fetching the wizard's "Trending now" rail here, so
    // the data races the navigation instead of waiting for the wizard to mount.
    <Link href="/channel/new" onClick={warmTrendingNiches} className="btn-accent">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      Create channel
    </Link>
  )
}
