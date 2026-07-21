import { config } from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
const rootEnv = resolve(process.cwd(), '../../.env.local')
if (existsSync(rootEnv)) config({ path: rootEnv })

import bcrypt from 'bcryptjs'
import { eq, isNull } from 'drizzle-orm'
import { getDb } from './client.js'
import { users, channels } from './schema.js'

// Seed / promote the admin account and adopt any owner-less (legacy) channels.
// Run: pnpm --filter @reels/db seed:admin
//   ADMIN_EMAIL     (required) — the admin's email; Google SSO with this address links automatically.
//   ADMIN_PASSWORD  (optional) — set a password so the admin can sign in before Google OAuth is configured.
async function main() {
  const email = process.env['ADMIN_EMAIL']?.toLowerCase().trim()
  if (!email) throw new Error('ADMIN_EMAIL is not set (add it to .env.local)')

  const db = getDb()
  const password = process.env['ADMIN_PASSWORD']
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined

  const existing = await db.select().from(users).where(eq(users.email, email)).then((r) => r[0])
  let adminId: string
  if (existing) {
    await db
      .update(users)
      .set({ role: 'admin', status: 'active', ...(passwordHash ? { passwordHash } : {}) })
      .where(eq(users.id, existing.id))
    adminId = existing.id
    console.log(`✓ Promoted existing user ${email} → admin/active (${adminId})`)
  } else {
    const [created] = await db
      .insert(users)
      .values({ email, name: 'Admin', role: 'admin', status: 'active', ...(passwordHash ? { passwordHash } : {}) })
      .returning({ id: users.id })
    adminId = created!.id
    console.log(`✓ Created admin ${email} (${adminId})`)
  }
  console.log(passwordHash ? '  Password set — you can sign in with email + password.' : '  No password set — sign in via Google with this email.')

  const adopted = await db
    .update(channels)
    .set({ userId: adminId })
    .where(isNull(channels.userId))
    .returning({ id: channels.id })
  console.log(`✓ Adopted ${adopted.length} owner-less channel(s) to admin`)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
