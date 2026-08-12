import { NextResponse, type NextRequest, type NextMiddleware } from 'next/server'
import { edgeAuth } from '@/auth.edge'

// Coarse defense-in-depth pre-filter for the API surface. This is NOT the security boundary — every
// route still verifies the session and checks tenant ownership through lib/api-access (requireApiUser /
// requireReelOwner / requireChannelOwner / requireStoryOwner). Its only job is to ensure a route that
// ships without a gate by mistake is still not reachable anonymously: no session cookie → 401, before
// any handler runs.
//
// It intentionally only checks for the PRESENCE of the auth.js session cookie (edge-safe, no DB, no
// crypto) so it can never wrongly reject a signed-in user. Forged/expired cookies pass here and are
// rejected cryptographically by the per-route gate.
//
// It is now wrapped in `edgeAuth` (auth.edge.ts) so that the session cookie actually gets refreshed.
// The wrapper reads the session and preserves the re-signed cookie onto the response; the gate below
// still decides the outcome from cookie presence alone, so the wrapper cannot make this stricter than
// it was. Scoped to /api/* as before — any real use of the app is API traffic, so the rolling refresh
// lands without putting a JWT decode on every page render.

// Login + self-signup must stay reachable without a session.
const PUBLIC_API = [/^\/api\/auth(\/|$)/, /^\/api\/register(\/|$)/]

// auth.js session cookie: "authjs.session-token" (http/dev) or "__Secure-authjs.session-token" (https).
const SESSION_COOKIE_NAMES = ['authjs.session-token', '__Secure-authjs.session-token']

function hasSessionCookie(req: NextRequest): boolean {
  // A token over ~4KB is split by auth.js into `<name>.0`, `<name>.1`, … (SessionStore.chunk in
  // @auth/core), and no cookie by the bare name is set at all. Matching the exact name only would
  // therefore 401 every API call for a creator who is perfectly signed in, with the pages around it
  // still rendering — so match the chunk prefix too.
  return req.cookies
    .getAll()
    .some((c) => SESSION_COOKIE_NAMES.some((name) => c.name === name || c.name.startsWith(`${name}.`)))
}

// Explicit NextMiddleware annotation (not inference) for the same reason auth.ts annotates its
// exports: the deep @auth/core generics leak into the declaration and trip TS2742.
//
// The cast goes through `unknown` because next-auth resolves this overload to its route-handler
// shape (AppRouteHandlerFn) rather than its middleware shape. Both are the same runtime path — the
// wrapper branch of initAuth is labelled "middleware.ts wrapper/route.ts" and calls one handleAuth
// for either — so only the declared context parameter differs, and middleware never reads it.
const middleware: NextMiddleware = edgeAuth(function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_API.some((re) => re.test(pathname))) return NextResponse.next()
  if (!hasSessionCookie(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.next()
}) as unknown as NextMiddleware

export default middleware

export const config = {
  matcher: ['/api/:path*'],
}
