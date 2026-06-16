import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createHmac } from 'node:crypto'

const COOKIE = 'op_session'
const MAX_AGE = 60 * 60 * 24 * 7  // 7 days

function sign(value: string): string {
  const secret = process.env['OPERATOR_PASSWORD'] ?? 'insecure-dev-secret'
  return createHmac('sha256', secret).update(value).digest('hex')
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
