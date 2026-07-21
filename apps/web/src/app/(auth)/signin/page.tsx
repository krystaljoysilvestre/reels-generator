'use client'
import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthShell, GoogleButton, OrDivider } from '../AuthShell'

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
    <AuthShell title="Welcome back" subtitle="Sign in to the pipeline console.">
      {inviteError && (
        <p className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-xs text-danger">
          That invite link is invalid or already used. You can still sign in below.
        </p>
      )}
      <GoogleButton label="Continue with Google" />
      <OrDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="current-password" required />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button type="submit" disabled={loading || !email || !password} className="btn-accent w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">
        No account? <Link href="/signup" className="font-medium text-accent">Sign up</Link>
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
