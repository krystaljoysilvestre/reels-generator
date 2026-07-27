import { getDb, users, channels, reels, invites } from '@reels/db'
import { count, desc, eq, gte, isNull, sum } from 'drizzle-orm'
import { requireAdmin } from '@/lib/auth'
import { AdminUsers } from './AdminUsers'
import { AdminInvites } from './AdminInvites'
import { ReelStatusPill } from '@/components/ReelStatusPill'

export const dynamic = 'force-dynamic'

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export default async function AdminPage() {
  const admin = await requireAdmin()
  const db = getDb()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const [userRows, chCounts, spendAll, spendMonth, platAll, platMonth, recentReels, openInvites] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)),
    db.select({ userId: channels.userId, n: count() }).from(channels).groupBy(channels.userId),
    db.select({ userId: channels.userId, cents: sum(reels.costCents) }).from(reels).innerJoin(channels, eq(reels.channelId, channels.id)).groupBy(channels.userId),
    db.select({ userId: channels.userId, cents: sum(reels.costCents) }).from(reels).innerJoin(channels, eq(reels.channelId, channels.id)).where(gte(reels.createdAt, monthStart)).groupBy(channels.userId),
    db.select({ cents: sum(reels.costCents) }).from(reels),
    db.select({ cents: sum(reels.costCents) }).from(reels).where(gte(reels.createdAt, monthStart)),
    db
      .select({
        id: reels.id,
        status: reels.status,
        updatedAt: reels.updatedAt,
        channelName: channels.name,
        ownerName: users.name,
        ownerEmail: users.email,
      })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .leftJoin(users, eq(channels.userId, users.id))
      .orderBy(desc(reels.updatedAt))
      .limit(20),
    db.select().from(invites).where(isNull(invites.usedAt)).orderBy(desc(invites.createdAt)),
  ])

  const chCountMap = new Map(chCounts.map((r) => [r.userId, Number(r.n)]))
  const spendAllMap = new Map(spendAll.map((r) => [r.userId, Number(r.cents ?? 0)]))
  const spendMonthMap = new Map(spendMonth.map((r) => [r.userId, Number(r.cents ?? 0)]))

  const usersView = userRows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    hasPassword: !!u.passwordHash,
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    channelCount: chCountMap.get(u.id) ?? 0,
    spendAllCents: spendAllMap.get(u.id) ?? 0,
    spendMonthCents: spendMonthMap.get(u.id) ?? 0,
  }))

  const invitesView = openInvites.map((i) => ({
    token: i.token,
    role: i.role,
    email: i.email,
    createdAt: i.createdAt ? i.createdAt.toISOString() : null,
  }))

  const platformAll = Number(platAll[0]?.cents ?? 0)
  const platformMonth = Number(platMonth[0]?.cents ?? 0)
  const pendingCount = usersView.filter((u) => u.status === 'pending').length

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg/80 px-8 py-5 backdrop-blur">
        <div>
          <h1 className="text-[22px] font-700 -tracking-[0.02em] text-ink">Admin</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            <span className="mono-value text-[13px]">{usersView.length}</span> user{usersView.length === 1 ? '' : 's'}
            {pendingCount > 0 ? <> · <span className="font-600 text-accent">{pendingCount} awaiting approval</span></> : ''}
          </p>
        </div>
        {/* Month spend, on a clapperboard slate */}
        <div className="hidden overflow-hidden rounded-sm border border-border-mid bg-surface sm:block" title="Tracked provider spend this month">
          <div className="clapper-band h-2" />
          <div className="flex items-center gap-3 px-3.5 py-1.5">
            <span className="mono-label text-[9px] tracking-micro-wide">Spend · month</span>
            <span className="mono-value text-ink">{money(platformMonth)}</span>
          </div>
        </div>
      </header>

      <div className="space-y-10 p-8">
        {/* Platform cost */}
        <section>
          <h2 className="micro-label mb-3.5">Platform cost</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Spent this month" value={money(platformMonth)} />
            <Stat label="Spent all-time" value={money(platformAll)} />
            <Stat label="Earned (revenue)" value="—" hint="wired when publications carry revenue" />
            <Stat label="Net" value="—" hint="revenue − cost, later" />
          </div>
          <p className="mt-2 text-xs text-faint">
            Cost is our tracked provider spend (estimated per token / second / character) — a close proxy for
            what we pay, not reconciled invoices.
          </p>
        </section>

        {/* Invites */}
        <section>
          <h2 className="micro-label mb-3.5">Invite test users</h2>
          <AdminInvites invites={invitesView} />
        </section>

        {/* Users */}
        <section>
          <h2 className="micro-label mb-3.5">Test users</h2>
          <AdminUsers users={usersView} currentUserId={admin.id} />
        </section>

        {/* Activity */}
        <section>
          <h2 className="micro-label mb-3.5">Recent activity</h2>
          <div className="card divide-y divide-border">
            {recentReels.length === 0 && <p className="p-4 text-sm text-muted">No activity yet.</p>}
            {recentReels.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-row-hover">
                <div className="min-w-0 truncate">
                  <span className="font-600 text-ink">{r.ownerName || r.ownerEmail || 'unknown'}</span>
                  <span className="text-muted"> · {r.channelName}</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <ReelStatusPill status={r.status} />
                  <span className="mono-value text-[11px] text-faint">
                    {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">Latest 20 reels across all users (derived from pipeline state).</p>
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="micro-label">{label}</p>
      <p className="mono-value mt-1.5 text-xl text-ink">{value}</p>
      {hint && <p className="mt-1 text-[10px] leading-snug text-faint">{hint}</p>}
    </div>
  )
}
