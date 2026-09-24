'use client'
import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AuthField, AuthShell, GoogleButton, OrDivider } from '../AuthShell'

export function SignUpForm({ open, googleEnabled, emailSignupEnabled, invited }: { open: boolean; googleEnabled: boolean; emailSignupEnabled: boolean; invited: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || undefined, email, password }),
      })
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string }
        setError(j.error ?? 'Could not create your account.')
        setLoading(false)
        return
      }
      const s = await signIn('credentials', { email, password, redirect: false })
      if (s?.error) {
        router.push('/signin')
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
    <AuthShell title="Create your account" subtitle={invited ? 'Your invitation is ready.' : open ? 'Free early access. No card needed.' : 'Request early access to Kendrix.'}>
      {invited && (
        <div className="mb-6 flex items-center gap-2.5 rounded-md border border-night-success-border bg-night-success-bg px-3.5 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-night-success" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="m22 4-10 10.01L9 11" />
          </svg>
          <p className="text-[12.5px] leading-normal text-night-success-body">
            Use the email your invitation was sent to. Your access opens when you join.
          </p>
        </div>
      )}
      {googleEnabled && <GoogleButton label="Sign up with Google" />}
      {googleEnabled && emailSignupEnabled && <OrDivider />}
      {emailSignupEnabled && <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField id="name" label="Name">
          <input id="name" type="text" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="input-dark" autoComplete="name" />
        </AuthField>
        <AuthField id="email" label="Email">
          <input id="email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} className="input-dark" autoComplete="email" required />
        </AuthField>
        <AuthField id="password" label="Password">
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-dark" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="password-hint" />
          <span id="password-hint" className="text-xs text-night-muted">At least 8 characters.</span>
        </AuthField>
        {error && <p role="alert" className="text-xs text-night-danger">{error}</p>}
        <button type="submit" disabled={loading || !email || password.length < 8} className="btn-primary mt-1 w-full py-3.5 text-[15px] font-700 shadow-glow-md">
          {loading ? 'Creating account…' : invited || open ? 'Create account' : 'Request access'}
        </button>
      </form>}
      {!googleEnabled && !emailSignupEnabled && <p className="text-sm text-night-body">Signup is temporarily unavailable. Please try again later.</p>}
      <p className="mt-5 text-xs leading-relaxed text-night-body">{open ? 'Create stories, review your reel, and download it to post. Early access includes production limits.' : 'We’re welcoming creators gradually. We’ll review your account before you can start.'} <Link href="/help" className="text-accent hover:underline">See how it works</Link></p>
      <p className="mt-7 text-center text-xs text-night-muted">
        Already have an account? <Link href="/signin" className="font-600 text-accent hover:text-accent-hover">Sign in</Link>
      </p>
    </AuthShell>
  )
}
