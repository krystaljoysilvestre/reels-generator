'use client'
import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthField, AuthShell, GoogleButton, OrDivider } from '../AuthShell'

function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const inviteError = params.get('error') === 'invite'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false })
    if (res?.error) {
      setError('Invalid email or password.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your studio console.">
      {inviteError && (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-night-danger">
          That invite link is invalid or already used. You can still sign in below.
        </p>
      )}
      <GoogleButton label="Continue with Google" />
      <OrDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField id="email" label="Email">
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark" autoComplete="email" required />
        </AuthField>
        <AuthField id="password" label="Password">
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark" autoComplete="current-password" required />
        </AuthField>
        {error && <p className="text-xs text-night-danger">{error}</p>}
        <button type="submit" disabled={loading || !email || !password} className="btn-primary mt-1 w-full gap-2 py-3.5 text-[15px] font-700 shadow-glow-md">
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>
      <p className="mt-7 text-center text-xs text-night-muted">
        No account? <Link href="/signup" className="font-600 text-accent hover:text-accent-hover">Sign up</Link>
      </p>
    </AuthShell>
  )
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}
