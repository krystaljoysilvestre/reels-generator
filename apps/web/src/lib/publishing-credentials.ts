// OAuth redirect state — a signed, expiring envelope that carries the channel and user through
// Google's redirect so the callback can trust what came back. Web-only by nature: the worker never
// runs a browser redirect. The CREDENTIAL crypto that used to live here moved to @reels/db, which
// owns the encrypted columns and is reachable from the worker too.

import { createHmac, timingSafeEqual } from 'node:crypto'

type OAuthState = { channelId: string; userId: string; nonce: string; expiresAt: number }

function stateSecret(): string {
  const secret = process.env['AUTH_SECRET']
  if (!secret) throw new Error('AUTH_SECRET is not configured')
  return secret
}

export function signOAuthState(payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function verifyOAuthState(state: string): OAuthState | null {
  const [body, signature] = state.split('.')
  if (!body || !signature) return null
  const expected = createHmac('sha256', stateSecret()).update(body).digest()
  const supplied = Buffer.from(signature, 'base64url')
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState
    if (!parsed.channelId || !parsed.userId || !parsed.nonce || parsed.expiresAt < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}
