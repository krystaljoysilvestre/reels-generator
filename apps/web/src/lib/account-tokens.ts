import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { getDb, users, verificationTokens } from '@reels/db'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { invalidateUserProfile } from './user-profile'

export type AccountTokenPurpose = 'verify' | 'reset'

export const accountPasswordSchema = z.string()
  .min(8, 'Use at least 8 characters.')
  .max(72, 'Use a shorter password (up to 72 bytes).')
  .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, 'Use a shorter password (up to 72 bytes).')

// The UUID lets redemption use the composite primary key rather than scanning token hashes.
export const accountTokenSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/,
  'This link is invalid or has expired.',
)

const TTL_MS: Record<AccountTokenPurpose, number> = { verify: 24 * 60 * 60 * 1000, reset: 60 * 60 * 1000 }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

type Account = { id: string; email: string | null; authVersion: number }
function identifier(account: Account, purpose: AccountTokenPurpose): string {
  // Bind to the address and session version too: an old link must not verify a replacement address
  // or survive password recovery. Neither the email address nor the bearer secret is stored here.
  return `account:${purpose}:${account.id}:${account.authVersion}:${hash(account.email ?? '')}`
}

export async function issueAccountToken(userId: string, purpose: AccountTokenPurpose): Promise<string> {
  const secret = randomBytes(32).toString('hex')
  await getDb().transaction(async (tx) => {
    const [account] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!account?.email) throw new Error('Account email is unavailable.')
    const key = identifier(account, purpose)
    // User row locking serializes issue and redemption. Only the latest link for this purpose works.
    await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, key))
    await tx.insert(verificationTokens).values({
      identifier: key,
      token: hash(secret),
      expires: new Date(Date.now() + TTL_MS[purpose]),
    })
  })
  return `${userId}.${secret}`
}

async function redeem(token: string, purpose: AccountTokenPurpose, passwordHash?: string): Promise<boolean> {
  if (!accountTokenSchema.safeParse(token).success) return false
  const [userId, secret] = token.split('.') as [string, string]
  const consumed = await getDb().transaction(async (tx) => {
    // All token operations take locks in this order, avoiding issue/reset races and deadlocks.
    const [account] = await tx.select().from(users).where(eq(users.id, userId)).for('update')
    if (!account?.email) return false
    if (purpose === 'verify' && !['pending', 'active'].includes(account.status)) return false
    const [claimed] = await tx.delete(verificationTokens).where(and(
      eq(verificationTokens.identifier, identifier(account, purpose)),
      eq(verificationTokens.token, hash(secret)),
      gt(verificationTokens.expires, new Date()),
    )).returning({ identifier: verificationTokens.identifier })
    if (!claimed) return false

    if (purpose === 'verify') {
      await tx.update(users).set({
        emailVerified: new Date(),
        ...(account.status === 'pending' && process.env['SIGNUP_MODE'] === 'open' ? { status: 'active' } : {}),
      }).where(eq(users.id, userId))
    } else {
      if (!passwordHash) throw new Error('Password reset requires a password hash.')
      await tx.update(users).set({ passwordHash, authVersion: sql`${users.authVersion} + 1` }).where(eq(users.id, userId))
      // Reset revokes outstanding verification links as well as old sessions. It does not verify
      // email or grant access; those remain separate, explicit actions.
      await tx.delete(verificationTokens).where(eq(verificationTokens.identifier, identifier(account, 'verify')))
    }
    return true
  })
  if (consumed) invalidateUserProfile(userId)
  return consumed
}

export function verifyAccountEmail(token: string): Promise<boolean> {
  return redeem(token, 'verify')
}

export async function resetAccountPassword(token: string, password: string): Promise<boolean> {
  if (!accountTokenSchema.safeParse(token).success || !accountPasswordSchema.safeParse(password).success) return false
  return redeem(token, 'reset', await bcrypt.hash(password, 10))
}
