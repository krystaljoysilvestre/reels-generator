// Which credential fetchYouTubeStats presents, and how. The branch matters more than it looks: an
// API key goes in the query string and a grant goes in a header, so getting it wrong authenticates
// as nobody and every audience read comes back empty — which is the failure this path exists to end.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchYouTubeStats } from './client.js'

function mockFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init ? { init } : {}) })
    if (String(url).includes('oauth2.googleapis.com')) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: 'at-123' }), { status: 200 }))
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({ items: [{ id: 'RRvU0b1TFAc', statistics: { viewCount: '41', likeCount: '3' } }] }),
        { status: 200 },
      ),
    )
  })
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchYouTubeStats auth', () => {
  it('sends an API key in the query string and never mints a token', async () => {
    const calls = mockFetch()
    const stats = await fetchYouTubeStats(['RRvU0b1TFAc'], { apiKey: 'k-secret' })

    expect(calls.some((c) => c.url.includes('oauth2.googleapis.com'))).toBe(false)
    expect(calls[0]!.url).toContain('key=k-secret')
    expect(calls[0]!.init?.headers).toBeUndefined()
    expect(stats).toEqual([{ videoId: 'RRvU0b1TFAc', views: 41, likes: 3, comments: null }])
  })

  it('exchanges a channel grant for a bearer token and keeps the key out of the URL', async () => {
    const calls = mockFetch()
    await fetchYouTubeStats(['RRvU0b1TFAc'], { clientId: 'c', clientSecret: 's', refreshToken: 'r' })

    expect(calls[0]!.url).toContain('oauth2.googleapis.com')
    expect(calls[1]!.url).not.toContain('key=')
    expect((calls[1]!.init?.headers as Record<string, string>)['Authorization']).toBe('Bearer at-123')
  })

  it('makes no request at all when there is nothing published to read', async () => {
    const calls = mockFetch()
    expect(await fetchYouTubeStats([], { apiKey: 'k' })).toEqual([])
    expect(calls).toHaveLength(0)
  })
})
