import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getDb, platformConnections, encryptCredential } from '@reels/db'
import { requireChannelOwner } from '@/lib/api-access'
import { verifyOAuthState } from '@/lib/publishing-credentials'
import { exchangeYouTubeCode, getYouTubeIdentity, youtubeOAuthConfigured } from '@/lib/youtube-oauth'

function back(req: NextRequest, channelId: string, result: 'connected' | 'failed') {
  const url = new URL(`/channel/${channelId}/settings`, req.nextUrl.origin)
  url.searchParams.set('publishing', result)
  const response = NextResponse.redirect(url)
  response.cookies.set('kendrix_youtube_oauth', '', { maxAge: 0, path: '/api/publishing/youtube/callback' })
  return response
}

export async function GET(req: NextRequest) {
  const state = verifyOAuthState(req.nextUrl.searchParams.get('state') ?? '')
  if (!state) return NextResponse.json({ error: 'This connection link has expired.' }, { status: 400 })
  const gate = await requireChannelOwner(state.channelId)
  if (gate instanceof NextResponse) return gate
  const nonce = req.cookies.get('kendrix_youtube_oauth')?.value
  if (gate.id !== state.userId || !nonce || nonce !== state.nonce) {
    return NextResponse.json({ error: 'This connection could not be verified.' }, { status: 400 })
  }
  if (!youtubeOAuthConfigured()) return back(req, state.channelId, 'failed')
  const code = req.nextUrl.searchParams.get('code')
  if (!code || req.nextUrl.searchParams.has('error')) return back(req, state.channelId, 'failed')

  try {
    const tokens = await exchangeYouTubeCode(code)
    const identity = await getYouTubeIdentity(tokens.accessToken)
    const db = getDb()
    await db.insert(platformConnections).values({
      channelId: state.channelId,
      platform: 'yt',
      providerAccountId: identity.id,
      providerAccountName: identity.name,
      accessTokenEncrypted: encryptCredential(tokens.accessToken),
      ...(tokens.refreshToken ? { refreshTokenEncrypted: encryptCredential(tokens.refreshToken) } : {}),
      accessTokenExpiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      status: 'active',
      lastError: null,
    }).onConflictDoUpdate({
      target: [platformConnections.channelId, platformConnections.platform],
      set: {
        providerAccountId: identity.id,
        providerAccountName: identity.name,
        accessTokenEncrypted: encryptCredential(tokens.accessToken),
        ...(tokens.refreshToken ? { refreshTokenEncrypted: encryptCredential(tokens.refreshToken) } : {}),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
        status: 'active',
        lastError: null,
        connectedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    console.log(`[publishing] connected YouTube channel ${identity.id} to channel ${state.channelId}`)
    return back(req, state.channelId, 'connected')
  } catch (error) {
    console.error(`[publishing] YouTube connection failed for channel ${state.channelId}:`, error)
    return back(req, state.channelId, 'failed')
  }
}
