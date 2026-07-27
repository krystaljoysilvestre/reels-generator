'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChannelAvatar } from '@/components/ChannelAvatar'

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

// The mock's status palette: pending purple, active green, suspended clay.
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-success-soft text-success',
  pending: 'bg-status-pending-soft text-status-pending',
  suspended: 'bg-status-suspended-soft text-status-suspended',
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
          <tr className="border-b border-border text-left">
            <th className="micro-label px-4 py-3">User</th>
            <th className="micro-label px-4 py-3">Role</th>
            <th className="micro-label px-4 py-3">Status</th>
            <th className="micro-label px-4 py-3 text-right">Chan.</th>
            <th className="micro-label px-4 py-3 text-right">Spend mo / all</th>
            <th className="micro-label px-4 py-3">Last seen</th>
            <th className="micro-label px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => {
            const self = u.id === currentUserId
            const disabled = busy === u.id
            return (
              <tr key={u.id} className="transition-colors hover:bg-row-hover">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <ChannelAvatar name={u.name || u.email || '?'} className="h-8 w-8" textClass="text-[11px]" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-600 text-ink">{u.name || '—'}</span>
                        {self && <span className="mono-label text-[9px] text-accent">you</span>}
                      </div>
                      <div className="truncate text-xs text-faint">{u.email || 'no email'}{u.hasPassword ? '' : ' · SSO'}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
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
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-2xl px-2.5 py-1 text-[11px] font-600 capitalize ${STATUS_STYLE[u.status] ?? 'bg-subtle-strong text-muted'}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    {u.status}
                  </span>
                </td>
                <td className="mono-value px-4 py-3 text-right text-[13px]">{u.channelCount}</td>
                <td className="mono-value px-4 py-3 text-right text-[11px] text-muted">
                  {money(u.spendMonthCents)} / {money(u.spendAllCents)}
                </td>
                <td className="mono-value px-4 py-3 text-[11px] text-faint">
                  {u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 text-right">
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
