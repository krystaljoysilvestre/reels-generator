'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [savedName, setSavedName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const result = await response.json() as { name?: string; error?: string }
      if (!response.ok || typeof result.name !== 'string') {
        setError(result.error ?? 'Your name couldn’t be saved. Please try again.')
        return
      }
      setName(result.name)
      setSavedName(result.name)
      setSaved(true)
      router.refresh()
    } catch {
      setError('We couldn’t connect. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="max-w-md">
      <label htmlFor="account-name" className="mb-2 block text-sm font-600 text-ink">Your name</label>
      <input
        id="account-name"
        name="name"
        autoComplete="name"
        required
        maxLength={80}
        value={name}
        disabled={saving}
        onChange={(event) => { setName(event.target.value); setSaved(false); setError('') }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'profile-error' : undefined}
        className="input w-full"
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving || !name.trim() || name.trim() === savedName} className="btn-primary">
          {saving ? 'Saving…' : 'Save name'}
        </button>
        <p role="status" className="text-sm text-success">{saved ? 'Name saved.' : ''}</p>
      </div>
      {error && <p id="profile-error" role="alert" className="mt-3 text-sm text-danger">{error}</p>}
    </form>
  )
}
