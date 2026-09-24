'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthField, AuthShell } from './AuthShell'

export function RecoveryForm({ kind, enabled = true }: { kind: 'forgot' | 'reset' | 'verify'; enabled?: boolean }) {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const title = kind === 'forgot' ? 'Forgot your password?' : kind === 'reset' ? 'Set a new password' : 'Confirm your email'
  const subtitle = kind === 'forgot' ? 'We’ll send you a link to start again.' : kind === 'reset' ? 'Choose a password you haven’t used here before.' : 'One last step before your next story.'
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (kind === 'reset' && password !== confirm) { setError('The passwords don’t match.'); return }
    setBusy(true)
    setError('')
    const endpoint = kind === 'forgot' ? 'forgot-password' : kind === 'reset' ? 'reset-password' : 'verify-email'
    try {
      const response = await fetch(`/api/account/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(kind === 'forgot' ? { email } : kind === 'reset' ? { token, password } : { token }) })
      const data = await response.json() as { error?: string }
      if (!response.ok) { setError(data.error ?? 'This link couldn’t be used. Please request a new one.'); return }
      setDone(true)
      if (kind === 'reset') router.replace('/signin?reset=1')
    } catch { setError('Could not connect. Please try again.') }
    finally { setBusy(false) }
  }
  const validLink = kind === 'forgot' || Boolean(token)
  return <AuthShell title={title} subtitle={subtitle}>
    {!enabled ? <p className="text-sm text-night-body">Email recovery is temporarily unavailable. You can still sign in with your usual method.</p> : done ? <div role="status" className="space-y-4 text-sm leading-relaxed text-night-body">
      <p>{kind === 'forgot' ? 'If this email has a password account, a reset link is on its way. Check your spam folder too. If you joined with Google, continue with Google on the sign-in page.' : 'Your email is confirmed. Continue to your account to check your access.'}</p>
      {kind === 'verify' && <Link href="/dashboard" className="btn-primary w-full">Continue to Kendrix</Link>}
    </div> : !validLink ? <p role="alert" className="text-sm text-night-danger">This link is incomplete. Request a new one from {kind === 'reset' ? <Link href="/forgot-password" className="underline">password recovery</Link> : <Link href="/pending" className="underline">your account</Link>}.</p> : <form onSubmit={submit} className="space-y-4">
      {kind === 'forgot' && <AuthField id="email" label="Email"><input id="email" className="input-dark" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></AuthField>}
      {kind === 'reset' && <><AuthField id="password" label="New password"><input id="password" className="input-dark" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={e => setPassword(e.target.value)} /></AuthField><AuthField id="confirm" label="Confirm password"><input id="confirm" className="input-dark" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirm} onChange={e => setConfirm(e.target.value)} /></AuthField><p className="text-xs text-night-muted">At least 8 characters. Your other sessions will be signed out.</p></>}
      {kind === 'verify' && <p className="text-sm leading-relaxed text-night-body">Confirm that this email belongs to you to finish setting up your account.</p>}
      {error && <div role="alert" className="text-sm text-night-danger"><p>{error}</p>{kind !== 'forgot' && <Link href={kind === 'reset' ? '/forgot-password' : '/pending'} className="mt-2 inline-block underline">Request a new link</Link>}</div>}
      <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Working…' : kind === 'forgot' ? 'Send reset link' : kind === 'reset' ? 'Save password' : 'Confirm email'}</button>
    </form>}
    <Link href="/signin" className="mt-6 block text-center text-xs text-night-body hover:text-white">Back to sign in</Link>
  </AuthShell>
}
