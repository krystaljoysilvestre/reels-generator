import NextAuth, { type NextAuthConfig, type NextAuthResult } from 'next-auth'
import Google from 'next-auth/providers/google'

// The edge-safe half of the auth config — session handling only, with none of auth.ts's Node-only
// weight (the Drizzle adapter, bcrypt, the DB-reading callbacks). It exists for exactly one job:
// letting middleware refresh the session cookie.
//
// Why that needs its own config at all: every `auth()` call in this app is argument-less, which in
// next-auth v5 is the React-Server-Component branch — it reads the session and DISCARDS the
// `Set-Cookie` the read produces. @auth/core re-signs the JWT with a fresh expiry on every session
// read (lib/actions/session.js), so the refresh was being generated and thrown away on every single
// request: the cookie's 30-day window ran from sign-in and never moved. Wrapping middleware with
// `auth()` uses the wrapper branch instead, which preserves those cookies onto the response.
//
// No `jwt` callback here on purpose. The default passes the decoded token straight through, so the
// re-signed cookie carries exactly the claims it already had — middleware refreshes the expiry and
// never rewrites identity. Enrichment (role/status) stays in auth.ts where the database lives.
export const edgeAuthConfig: NextAuthConfig = {
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/signin' },
  // Never invoked from middleware (no sign-in flow runs here) — present so the config validates.
  // Credentials is deliberately absent: its authorize path uses bcrypt, which is not edge-safe.
  providers: [Google],
}

const edge = NextAuth(edgeAuthConfig)
export const edgeAuth: NextAuthResult['auth'] = edge.auth
