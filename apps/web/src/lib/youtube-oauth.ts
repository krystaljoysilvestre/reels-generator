const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
]

export function youtubeOAuthConfigured(): boolean {
  return Boolean(process.env['YOUTUBE_CLIENT_ID'] && process.env['YOUTUBE_CLIENT_SECRET'])
}

export function youtubeRedirectUri(): string {
  const origin = process.env['AUTH_URL'] ?? process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'
  return `${origin.replace(/\/$/, '')}/api/publishing/youtube/callback`
}

export function youtubeAuthorizationUrl(state: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: process.env['YOUTUBE_CLIENT_ID']!,
    redirect_uri: youtubeRedirectUri(),
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    scope: YOUTUBE_SCOPES.join(' '),
    state,
  }).toString()
  return url.toString()
}

export async function exchangeYouTubeCode(code: string): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresAt: Date
  scopes: string[]
}> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env['YOUTUBE_CLIENT_ID']!,
      client_secret: process.env['YOUTUBE_CLIENT_SECRET']!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: youtubeRedirectUri(),
    }),
  })
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`)
  const data = (await res.json()) as {
    access_token?: string; refresh_token?: string; expires_in?: number; scope?: string
  }
  if (!data.access_token) throw new Error('token exchange returned no access token')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scopes: (data.scope ?? YOUTUBE_SCOPES.join(' ')).split(/\s+/).filter(Boolean),
  }
}

export async function getYouTubeIdentity(accessToken: string): Promise<{ id: string; name: string }> {
  const res = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`channel lookup failed (${res.status})`)
  const data = (await res.json()) as { items?: Array<{ id?: string; snippet?: { title?: string } }> }
  const channel = data.items?.[0]
  if (!channel?.id) throw new Error('This Google account has no YouTube channel')
  return { id: channel.id, name: channel.snippet?.title ?? 'YouTube channel' }
}
