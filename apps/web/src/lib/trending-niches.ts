'use client'

// Client-side loader for the wizard's "Trending now" rail. The fetch starts at the moment of INTENT —
// the "Create channel" click — and the wizard reuses that same in-flight promise after navigation
// (module state survives Next's client-side transitions). A direct load of /channel/new (deep link,
// refresh, draft resume) starts the fetch at mount instead, where mount IS the intent. The server
// caches results for a day, so none of this re-triggers the actual web search.

export interface TrendingNiche {
  label: string
  blurb: string
  description: string
  rpm: 'high' | 'mid'
  whyNow: string
  language: string
}

let flight: Promise<TrendingNiche[]> | null = null

export function getTrendingNiches(): Promise<TrendingNiche[]> {
  flight ??= fetch('/api/channel/trending-niches')
    .then((r) => (r.ok ? r.json() : null))
    .then((json: { niches?: TrendingNiche[] } | null) => (Array.isArray(json?.niches) ? json.niches : []))
    .catch(() => {
      flight = null // failed flights don't stick — the next caller retries
      return []
    })
  return flight
}

// Fire-and-forget warm-up for the "Create channel" click — the rail's data races the navigation.
export function warmTrendingNiches(): void {
  void getTrendingNiches()
}
