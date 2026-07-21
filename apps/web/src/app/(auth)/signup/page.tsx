'use client'
import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AuthShell, GoogleButton, OrDivider } from '../AuthShell'

function SignUpForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const params = useSearchParams()
  const invited = params.get('invite') === '1'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
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
  }

  return (
    <AuthShell title="Create your account" subtitle={invited ? 'You were invited — finish signing up.' : 'Start building channels.'}>
      {invited && (
        <p className="mb-4 rounded-md bg-positive-soft px-3 py-2 text-xs text-positive">
          You were invited: your account is approved automatically.
        </p>
      )}
      <GoogleButton label="Sign up with Google" />
      <OrDivider />
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-xs font-medium text-muted">Name</label>
          <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-xs font-medium text-muted">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-xs font-medium text-muted">Password</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" autoComplete="new-password" required minLength={8} />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <button type="submit" disabled={loading || !email || password.length < 8} className="btn-accent w-full">
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-xs text-muted">
        Already have an account? <Link href="/signin" className="font-medium text-accent">Sign in</Link>
      </p>
    </AuthShell>
  )
}

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  )
}
