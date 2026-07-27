import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export type SessionUser = {
  id: string
  role: string // 'admin' | 'tester'
  status: string // 'pending' | 'active' | 'suspended'
  email: string | null
  name: string | null
  image: string | null
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth()
  const u = session?.user
  if (!u?.id) return null
  return {
    id: u.id,
    role: u.role,
    status: u.status,
    email: u.email ?? null,
    name: u.name ?? null,
    image: u.image ?? null,
  }
}

// Back-compat boolean gate for the many API routes that only need "is this request authenticated".
export async function getSession(): Promise<boolean> {
  return (await getCurrentUser()) != null
}

// For pages/handlers that need the identity; redirects to sign-in when unauthenticated.
export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser()
  if (!u) redirect('/signin')
  return u
}

// Page gate (name kept for existing callers): signed in AND approved. Gates the whole (app) group.
// Returns the user so layouts can render identity/role without a second lookup.
export async function requireAuth(): Promise<SessionUser> {
  const u = await getCurrentUser()
  if (!u) redirect('/signin')
  if (u.status !== 'active') redirect('/pending')
  return u
}

// Admin-only page gate.
export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser()
  if (u.status !== 'active' || u.role !== 'admin') redirect('/dashboard')
  return u
}
