'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Inv = { token: string; role: string; email: string | null; createdAt: string | null }

/** Compact age for an open invite — the mock's "2d ago" / "5h ago". */
function relativeAge(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

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
    <div className="card relative overflow-hidden p-5">
      {/* brand edge, per the mock */}
      <span className="absolute inset-x-0 top-0 h-1 bg-brand" />

      <div className="flex flex-wrap items-end gap-3 pt-1">
        <div className="flex flex-1 flex-col gap-1.5" style={{ minWidth: 200 }}>
          <label htmlFor="invite-email" className="text-xs font-600 text-muted">
            Email <span className="font-400 text-faint">· binds the invite to one person (optional)</span>
          </label>
          <input
            id="invite-email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tester@studio.com"
            className="input h-10"
          />
        </div>
        {/* Role — a segmented toggle (the mock's shape), same two values as before */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-600 text-muted">Role</span>
          <div className="inline-flex h-10 items-center gap-0.5 rounded-sm border border-border-mid bg-subtle-strong p-0.5">
            {(['tester', 'admin'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                aria-pressed={role === r}
                className={`h-full rounded-[7px] px-3.5 text-xs font-600 capitalize transition-colors ${
                  role === r ? 'bg-brand-3 text-white shadow-xs' : 'text-muted hover:text-ink'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <button onClick={create} disabled={creating} className="btn-accent h-10 gap-2">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M19 8v6M22 11h-6" />
          </svg>
          {creating ? 'Creating…' : 'Create invite link'}
        </button>
      </div>

      {invites.length > 0 && (
        <div className="mt-5 divide-y divide-border-soft border-t border-border">
          {invites.map((inv) => (
            <div key={inv.token} className="flex items-center justify-between gap-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  <span className="rounded-2xl bg-accent-soft px-2 py-0.5 text-[11px] font-600 capitalize text-accent">{inv.role}</span>
                  <span className="truncate font-600 text-ink">{inv.email || 'anyone with the link'}</span>
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-faint">{linkFor(inv.token)}</p>
              </div>
              {inv.createdAt && (
                <span className="mono-value hidden flex-shrink-0 text-[11px] text-faint sm:block">{relativeAge(inv.createdAt)}</span>
              )}
              <button onClick={() => copy(inv.token)} className="btn-secondary btn-sm flex-shrink-0 gap-1.5">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
                </svg>
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
