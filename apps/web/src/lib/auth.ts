import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createHmac, randomBytes } from 'node:crypto'

const COOKIE = 'op_session'
const MAX_AGE = 60 * 60 * 24 * 7  // 7 days

// HMAC secret. If OPERATOR_PASSWORD is unset, fall back to a random per-process value rather than a
// hardcoded constant — the old 'insecure-dev-secret' literal lives in the public repo, so any deploy
// that failed to load the env var had forgeable cookies. Login is already blocked when the password is
// unset (/api/auth rejects it), so no valid session can exist; a random secret just makes getSession
// fail closed instead of accepting a forged cookie.
const SECRET = process.env['OPERATOR_PASSWORD'] || randomBytes(32).toString('hex')

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex')
}

export async function setSession(): Promise<void> {
  const jar = await cookies()
  const token = 'authenticated'
  jar.set(COOKIE, `${token}.${sign(token)}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export async function clearSession(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}

export async function getSession(): Promise<boolean> {
  const jar = await cookies()
  const raw = jar.get(COOKIE)?.value
  if (!raw) return false
  const [token, sig] = raw.split('.')
  if (!token || !sig) return false
  return sig === sign(token)
}

export async function requireAuth(): Promise<void> {
  const ok = await getSession()
  if (!ok) redirect('/login')
}
