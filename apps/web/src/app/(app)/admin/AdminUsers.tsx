'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type U = {
  id: string
  name: string | null
  email: string | null
  role: string
  status: string
  hasPassword: boolean
  lastSeenAt: string | null
  channelCount: number
  spendAllCents: number
  spendMonthCents: number
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-positive-soft text-positive',
  pending: 'bg-accent-soft text-accent',
  suspended: 'bg-danger-soft text-danger',
}

export function AdminUsers({ users, currentUserId }: { users: U[]; currentUserId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function patch(id: string, body: { status?: string; role?: string }) {
    setBusy(id)
    const res = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(null)
    if (res.ok) router.refresh()
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted">
            <th className="px-4 py-2.5 font-medium">User</th>
            <th className="px-4 py-2.5 font-medium">Role</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium text-right">Channels</th>
            <th className="px-4 py-2.5 font-medium text-right">Spend (mo / all)</th>
            <th className="px-4 py-2.5 font-medium">Last seen</th>
            <th className="px-4 py-2.5 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => {
            const self = u.id === currentUserId
            const disabled = busy === u.id
            return (
              <tr key={u.id}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink">{u.name || '—'}</div>
                  <div className="text-xs text-muted">{u.email || 'no email'}{u.hasPassword ? '' : ' · SSO'}</div>
                </td>
                <td className="px-4 py-2.5">
                  <select
                    value={u.role}
                    disabled={disabled || self}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="input h-8 py-0 text-xs"
                    title={self ? 'You cannot change your own role' : ''}
                  >
                    <option value="tester">tester</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`badge ${STATUS_STYLE[u.status] ?? 'bg-subtle text-muted'}`}>{u.status}</span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{u.channelCount}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-muted">
                  {money(u.spendMonthCents)} / {money(u.spendAllCents)}
                </td>
                <td className="px-4 py-2.5 text-xs text-faint">
                  {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {u.status === 'pending' && (
                    <button disabled={disabled} onClick={() => patch(u.id, { status: 'active' })} className="btn-accent btn-sm">Approve</button>
                  )}
                  {u.status === 'active' && !self && (
                    <button disabled={disabled} onClick={() => patch(u.id, { status: 'suspended' })} className="btn-ghost btn-sm text-danger">Suspend</button>
                  )}
                  {u.status === 'suspended' && (
                    <button disabled={disabled} onClick={() => patch(u.id, { status: 'active' })} className="btn-ghost btn-sm">Reactivate</button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
