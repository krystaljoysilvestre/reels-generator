import NextAuth, { type NextAuthConfig, type NextAuthResult } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb, users, accounts, sessions, verificationTokens } from '@reels/db'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { checkRateLimit } from '@reels/providers'
import { consumeInviteForUser } from '@/lib/invite'

const db = getDb()

// Explicit annotation (not `satisfies`) so the exported type is nameable — avoids TS2742 from the
// deep @auth/core generics leaking into the declaration.
export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // JWT strategy is required for the Credentials provider (and keeps sessions stateless).
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: { signIn: '/signin' },
  providers: [
    // Google verifies emails, so linking a Google login to an existing same-email account (e.g. the
    // seeded admin, or someone who first signed up with a password) is safe here.
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const email = (creds?.email as string | undefined)?.toLowerCase().trim()
        const password = creds?.password as string | undefined
        if (!email || !password) return null
        // Brute-force guard: cap attempts per email per 15-min window BEFORE the expensive bcrypt compare.
        // Over-limit returns null (a generic auth failure), so it neither confirms the email nor burns CPU.
        const rl = await checkRateLimit(`signin:email:${email}`, 8, 15 * 60 * 1000)
        if (!rl.ok) return null
        const row = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0])
        if (!row?.passwordHash) return null
        const ok = await bcrypt.compare(password, row.passwordHash)
        if (!ok) return null
        // Access gating (pending/suspended) happens in requireAuth via the fresh DB read in the
        // session callback — authorize only proves the credentials are correct.
        return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status }
      },
    }),
  ],
  callbacks: {
    // Keep the JWT lean: identity only. role/status are read fresh from the DB in `session` so that
    // an admin approving/suspending/re-roling a user takes effect on their next request.
    jwt: async ({ token, user }) => {
      if (user?.id) token.uid = user.id
      return token
    },
    session: async ({ session, token }) => {
      const uid = token.uid as string | undefined
      if (uid && session.user) {
        session.user.id = uid
        const row = await db
          .select({ role: users.role, status: users.status, name: users.name, image: users.image })
          .from(users)
          .where(eq(users.id, uid))
          .then((r) => r[0])
        session.user.role = row?.role ?? 'tester'
        session.user.status = row?.status ?? 'pending'
        // Display name + avatar also come from the DB rather than the JWT, so the profile backfill
        // below (or a changed Google photo) shows up on the next request instead of the next login.
        if (row?.name) session.user.name = row.name
        if (row?.image) session.user.image = row.image
      }
      return session
    },
  },
  events: {
    // A brand-new OAuth (Google) user is created here by the adapter with defaults (tester/pending).
    // If they arrived through a valid invite link, upgrade them to the invite's role + active.
    createUser: async ({ user }) => {
      if (user?.id) await consumeInviteForUser(user.id)
    },
    signIn: async ({ user, account, profile }) => {
      if (!user?.id) return
      const patch: { lastSeenAt: Date; name?: string; image?: string } = { lastSeenAt: new Date() }
      // Linking an OAuth account to an existing row (allowDangerousEmailAccountLinking, above) does
      // NOT refresh that row's profile fields — a seeded admin keeps its placeholder name and has no
      // avatar. Nothing in the app lets a user set either field, so the verified provider profile is
      // our only source: sync it on every OAuth sign-in.
      if (account?.type === 'oauth' || account?.type === 'oidc') {
        const p = profile as { name?: unknown; picture?: unknown; image?: unknown } | undefined
        const name = typeof p?.name === 'string' ? p.name.trim() : ''
        const image = typeof p?.picture === 'string' ? p.picture : typeof p?.image === 'string' ? p.image : ''
        if (name) patch.name = name
        if (image) patch.image = image
      }
      await db.update(users).set(patch).where(eq(users.id, user.id))
    },
  },
}

// Per-binding annotations via NextAuthResult indexed access keep each exported symbol's type
// nameable (portable) — plain destructuring re-triggers TS2742 on `auth`/`signIn`.
const nextAuth = NextAuth(authConfig)
export const handlers = nextAuth.handlers
export const auth: NextAuthResult['auth'] = nextAuth.auth
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut
