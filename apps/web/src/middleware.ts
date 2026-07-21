import { NextResponse, type NextRequest } from 'next/server'

// Coarse defense-in-depth pre-filter for the API surface. This is NOT the security boundary — every
// route still verifies the session and checks tenant ownership through lib/api-access (requireApiUser /
// requireReelOwner / requireChannelOwner / requireStoryOwner). Its only job is to ensure a route that
// ships without a gate by mistake is still not reachable anonymously: no session cookie → 401, before
// any handler runs.
//
// It intentionally only checks for the PRESENCE of the auth.js session cookie (edge-safe, no DB, no
// crypto) so it can never wrongly reject a signed-in user. Forged/expired cookies pass here and are
// rejected cryptographically by the per-route gate. A stronger authorized-callback middleware needs the
// edge-split auth config (auth.config.ts without the Drizzle adapter) — tracked as a follow-up.

// Login + self-signup must stay reachable without a session.
const PUBLIC_API = [/^\/api\/auth(\/|$)/, /^\/api\/register(\/|$)/]

// auth.js session cookie: "authjs.session-token" (http/dev) or "__Secure-authjs.session-token" (https).
function hasSessionCookie(req: NextRequest): boolean {
  return (
    req.cookies.has('authjs.session-token') ||
    req.cookies.has('__Secure-authjs.session-token')
  )
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl
  if (PUBLIC_API.some((re) => re.test(pathname))) return NextResponse.next()
  if (!hasSessionCookie(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
