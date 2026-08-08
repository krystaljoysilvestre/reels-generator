import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site'

/**
 * Five pages, listed by hand. A generated crawl would be overkill at this size and would happily
 * emit whatever routes exist — including any that shouldn't be indexed.
 *
 * `lastModified` is intentionally the build time rather than a hardcoded date: it is honest for a
 * statically-built marketing site (the pages really are as fresh as the deploy) and it can't rot
 * into a stale literal that nobody remembers to bump.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return [
    { url: SITE_URL, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/about`, lastModified, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/contact`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
