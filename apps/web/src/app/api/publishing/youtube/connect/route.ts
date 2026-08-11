import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireChannelOwner } from '@/lib/api-access'
import { publishingCredentialsConfigured, signOAuthState } from '@/lib/publishing-credentials'
import { youtubeAuthorizationUrl, youtubeOAuthConfigured } from '@/lib/youtube-oauth'

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get('channelId')
  const gate = await requireChannelOwner(channelId)
  if (gate instanceof NextResponse) return gate
  if (!youtubeOAuthConfigured() || !publishingCredentialsConfigured()) {
    return NextResponse.json({ error: 'YouTube connection is not ready yet.' }, { status: 501 })
  }

  const nonce = randomBytes(24).toString('base64url')
  const state = signOAuthState({ channelId: channelId!, userId: gate.id, nonce, expiresAt: Date.now() + 10 * 60_000 })
  const response = NextResponse.redirect(youtubeAuthorizationUrl(state))
  response.cookies.set('kendrix_youtube_oauth', nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60,
    path: '/api/publishing/youtube/callback',
  })
  return response
}
