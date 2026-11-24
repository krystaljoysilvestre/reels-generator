'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthField, AuthShell, GoogleButton, OrDivider } from '../AuthShell'

export function SignInForm({ googleEnabled, emailRecoveryEnabled }: { googleEnabled: boolean; emailRecoveryEnabled: boolean }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const authError = params.get('error')
  const inviteError = authError === 'invite'
  const linkedError = authError === 'OAuthAccountNotLinked'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await signIn('credentials', { email, password, redirect: false })
      if (res?.error) {
        setError('Invalid email or password.')
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('Could not connect. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Your next story starts here.">
      {inviteError && (
        <p className="mb-4 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-night-danger">
          That invite link is invalid or already used. You can still sign in below.
        </p>
      )}
      {linkedError && <p role="alert" className="mb-4 text-sm text-night-danger">Google isn’t linked to this account. Sign in with your original method, or open <Link href="/forgot-password" className="underline">password recovery</Link>{emailRecoveryEnabled ? ' to reset your password.' : ' for help.'}</p>}
      {authError && !inviteError && !linkedError && <p role="alert" className="mb-4 text-sm text-night-danger">Sign-in didn’t finish. Please try again.</p>}
      {params.get('reset') === '1' && <p role="status" className="mb-4 text-sm text-night-success">Password updated. Sign in with your new password.</p>}
      {googleEnabled && <><GoogleButton label="Continue with Google" /><p className="mt-2 text-xs leading-relaxed text-night-muted">Use Google if you joined with Google or already linked it to this account.</p><OrDivider /></>}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField id="email" label="Email">
          <input id="email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark" autoComplete="email" required />
        </AuthField>
        <AuthField id="password" label="Password">
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark" autoComplete="current-password" required />
        </AuthField>
        {error && <p role="alert" className="text-xs text-night-danger">{error}</p>}
        <button type="submit" disabled={loading || !email || !password} className="btn-primary mt-1 w-full gap-2 py-3.5 text-[15px] font-700 shadow-glow-md">
          {loading ? 'Signing in…' : 'Sign in'}
          {!loading && (
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>
      <p className="mt-4 text-right text-xs"><Link href="/forgot-password" className="text-accent hover:underline">Forgot password?</Link></p>
      <p className="mt-7 text-center text-xs text-night-muted">
        No account? <Link href="/signup" className="font-600 text-accent hover:text-accent-hover">Sign up</Link>
      </p>
    </AuthShell>
  )
}
