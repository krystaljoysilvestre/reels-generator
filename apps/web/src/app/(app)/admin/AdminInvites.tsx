'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Inv = { token: string; role: string; email: string | null; createdAt: string | null }

export function AdminInvites({ invites }: { invites: Inv[] }) {
  const router = useRouter()
  const [role, setRole] = useState('tester')
  const [email, setEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  function linkFor(token: string): string {
    if (typeof window === 'undefined') return `/join/${token}`
    return `${window.location.origin}/join/${token}`
  }

  async function create() {
    setCreating(true)
    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, email: email || undefined }),
    })
    setCreating(false)
    if (res.ok) {
      setEmail('')
      router.refresh()
    }
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(token))
      setCopied(token)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // clipboard unavailable — ignore
    }
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted">Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="input h-9 py-0">
            <option value="tester">tester</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: 200 }}>
          <label className="text-xs font-medium text-muted">Email (optional)</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="who is this for?" className="input h-9" />
        </div>
        <button onClick={create} disabled={creating} className="btn-accent h-9">
          {creating ? 'Creating…' : 'Create invite link'}
        </button>
      </div>

      {invites.length > 0 && (
        <div className="mt-5 divide-y divide-border border-t border-border">
          {invites.map((inv) => (
            <div key={inv.token} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="badge bg-subtle text-muted">{inv.role}</span>
                <span className="ml-2 truncate text-muted">{inv.email || 'anyone with the link'}</span>
                <div className="mt-0.5 truncate font-mono text-xs text-faint">{linkFor(inv.token)}</div>
              </div>
              <button onClick={() => copy(inv.token)} className="btn-secondary btn-sm flex-shrink-0">
                {copied === inv.token ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          ))}
        </div>
      )}
      {invites.length === 0 && <p className="mt-4 text-sm text-muted">No open invites. Create one to onboard a tester.</p>}
    </div>
  )
}
