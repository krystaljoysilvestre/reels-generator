import NextAuth, { type NextAuthConfig, type NextAuthResult } from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { DrizzleAdapter } from '@auth/drizzle-adapter'
import { getDb, users, accounts, sessions, verificationTokens } from '@reels/db'
import { and, eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { checkRateLimit } from '@reels/providers'
import { consumeInviteForUser } from '@/lib/invite'
import { ACCOUNT_UNAVAILABLE, getUserProfile, invalidateUserProfile } from '@/lib/user-profile'
import { isOpenSignup } from '@/lib/signup-policy'

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
    // Never silently link a password account: an unverified registrant may have claimed this email.
    Google,
    Credentials({
      credentials: { email: {}, password: {} },
      authorize: async (creds) => {
        const email = typeof creds?.email === 'string' ? creds.email.toLowerCase().trim() : ''
        const password = typeof creds?.password === 'string' ? creds.password : ''
        // Keep existing passwords usable; new/reset passwords apply the stricter bcrypt byte limit.
        if (!email || email.length > 254 || !password || password.length > 200) return null
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
        return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, authVersion: row.authVersion }
      },
    }),
  ],
  callbacks: {
    signIn: async ({ account, profile }) => {
      if (account?.provider === 'google' && profile?.email_verified !== true) return false
      return true
    },
    // Keep the JWT lean: identity only. role/status are read fresh from the DB in `session` so that
    // an admin approving/suspending/re-roling a user takes effect on their next request.
    jwt: async ({ token, user }) => {
      if (user?.id) {
        token.uid = user.id
        // OAuth adapter users include app fields. Read the row when an adapter only returns its
        // standard shape; never reset a recovered account's version to zero on Google sign-in.
        const version = user.authVersion ?? (await db.select({ version: users.authVersion }).from(users).where(eq(users.id, user.id)))[0]?.version
        token.authVersion = version ?? 0
      }
      return token
    },
    session: async ({ session, token }) => {
      const uid = token.uid as string | undefined
      if (!uid || !session.user) return session
      session.user.id = uid
      // role/status/name/image come from the users row, not the JWT, so an admin approving or
      // suspending someone takes effect on their next request. lib/user-profile puts a short-lived
      // cache in front of that read and — critically — never lets a failed read throw here: a
      // throwing session callback is indistinguishable from "not signed in" to @auth/core, which is
      // how a database out of connections used to surface as a silent logout.
      const profile = await getUserProfile(uid)
      if (profile === ACCOUNT_UNAVAILABLE) {
        // Valid session, unreadable account. Say exactly that; the gates turn it into a 503.
        session.user.role = 'tester'
        session.user.status = ACCOUNT_UNAVAILABLE
        return session
      }
      if (profile === 'missing') {
        session.user.id = ''
        session.user.role = 'tester'
        session.user.status = 'pending'
        return session
      }
      if ((token.authVersion ?? 0) !== profile.authVersion) {
        session.user.id = ''
        session.user.role = 'tester'
        session.user.status = 'revoked'
        return session
      }
      session.user.role = profile.role
      session.user.status = profile.status
      // Display name + avatar are read the same way, so the profile backfill below (or a changed
      // Google photo) shows up on the next request instead of the next login.
      session.user.name = profile.name
      if (profile.image) session.user.image = profile.image
      return session
    },
  },
  events: {
    // The provider's verified-email claim is checked above before account creation.
    createUser: async ({ user }) => {
      if (!user?.id) return
      await consumeInviteForUser(user.id)
      invalidateUserProfile(user.id) // an invite can promote role + status; don't serve the pre-invite row
    },
    signIn: async ({ user, account, profile }) => {
      if (!user?.id) return
      await consumeInviteForUser(user.id)
      const patch: { lastSeenAt: Date; image?: string; emailVerified?: Date } = { lastSeenAt: new Date() }
      // Preserve the creator's chosen display name; provider photos can still refresh.
      if (account?.type === 'oauth' || account?.type === 'oidc') {
        const p = profile as { name?: unknown; picture?: unknown; image?: unknown } | undefined
        const image = typeof p?.picture === 'string' ? p.picture : typeof p?.image === 'string' ? p.image : ''
        if (image) patch.image = image
        if (account.provider === 'google' && profile?.email_verified === true) patch.emailVerified = new Date()
      }
      await db.update(users).set(patch).where(eq(users.id, user.id))
      if (isOpenSignup()) {
        const [current] = await db.select({ emailVerified: users.emailVerified }).from(users).where(eq(users.id, user.id))
        if (current?.emailVerified) {
          const activated = await db.update(users).set({ status: 'active' }).where(and(eq(users.id, user.id), eq(users.status, 'pending'))).returning({ id: users.id })
          if (activated.length) console.log(`[audit] early_access_activated actor=${user.id} target=${user.id}`)
        }
      }
      invalidateUserProfile(user.id) // name/image may have just changed; show them this request
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
