import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site'

/**
 * Answer engines are a first-class audience here, not an afterthought — a chunk of the people who
 * will ever hear about Kendrix will hear about it from an assistant rather than a search page.
 *
 * `*` already permits them, so the named blocks below change no behaviour today. They exist as a
 * standing decision: the AI crawlers are welcome, and anyone later reaching for a blanket
 * disallow has to delete an explicit `allow` to do it.
 */
export default function robots(): MetadataRoute.Robots {
  const aiCrawlers = [
    'GPTBot', // OpenAI — training + ChatGPT browsing
    'OAI-SearchBot', // OpenAI — ChatGPT search index
    'ChatGPT-User', // OpenAI — user-initiated fetches
    'ClaudeBot', // Anthropic
    'Claude-User',
    'PerplexityBot',
    'Perplexity-User',
    'Google-Extended', // gates Gemini/Vertex use of already-crawled pages
    'Applebot-Extended',
    'CCBot', // Common Crawl — the corpus much of the rest is built from
  ]

  return {
    rules: [
      // The API routes are POST-only form handlers; there is nothing there to index.
      { userAgent: '*', allow: '/', disallow: '/api/' },
      ...aiCrawlers.map((userAgent) => ({ userAgent, allow: '/', disallow: '/api/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
