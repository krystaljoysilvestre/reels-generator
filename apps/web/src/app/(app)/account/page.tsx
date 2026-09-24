import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq, sql } from 'drizzle-orm'
import { accounts, getDb, getUserUsage, users } from '@reels/db'
import { requireAuth } from '@/lib/auth'
import { accountUsage } from '@/lib/account-usage'
import { isAccountEmailConfigured } from '@/lib/account-email'
import { ProfileForm } from './ProfileForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Account' }

const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const resetDate = (date: Date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date)

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
  const percent = limit > 0 ? Math.min(100, Math.max(0, used / limit * 100)) : 100
  return <progress aria-label={label} value={percent} max={100} className="mt-4 h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-subtle-strong [&::-webkit-progress-value]:bg-accent [&::-moz-progress-bar]:bg-accent" />
}

export default async function AccountPage() {
  const user = await requireAuth()
  const db = getDb()
  const [[profile], providers, usage] = await Promise.all([
    db.select({ name: users.name, email: users.email, hasPassword: sql<boolean>`${users.passwordHash} is not null` })
      .from(users).where(eq(users.id, user.id)),
    db.select({ provider: accounts.provider }).from(accounts).where(eq(accounts.userId, user.id)),
    getUserUsage(user.id),
  ])
  if (!profile || !usage) notFound()
  const summary = accountUsage(usage)
  const methods = [
    ...(profile.hasPassword ? ['Email and password'] : []),
    ...new Set(providers.map(({ provider }) => provider === 'google' ? 'Google' : 'Connected account')),
  ]

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-8">
      <header className="mb-8">
        <p className="micro-label">Your studio</p>
        <h1 className="mt-2 text-3xl text-ink">Account</h1>
        <p className="mt-2 text-muted">Your details and early-access allowance.</p>
      </header>

      <section aria-labelledby="access-heading" className="card mb-6 bg-brand-wash p-5 sm:p-6">
        <span className="badge bg-success-soft text-success">Free early access</span>
        <h2 id="access-heading" className="mt-3 text-xl text-ink">Space to make your first stories.</h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-muted">
          Early access is free. No payment card or paid subscription is required. Production has an allowance
          so everyone has room to create while we improve Kendrix.
        </p>
      </section>

      <section aria-labelledby="profile-heading" className="card p-5 sm:p-6">
        <h2 id="profile-heading" className="mb-5 text-xl text-ink">Profile</h2>
        <ProfileForm initialName={profile.name ?? ''} />
        <dl className="mt-6 grid gap-5 border-t border-border-soft pt-5 sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Email</dt><dd className="mt-1 break-words text-sm text-ink">{profile.email ?? 'No email saved'}</dd></div>
          <div><dt className="text-xs text-muted">Sign-in methods</dt><dd className="mt-1 text-sm text-ink">{methods.join(' · ') || 'No sign-in method found'}</dd></div>
        </dl>
        {profile.hasPassword && isAccountEmailConfigured() && (
          <Link href="/forgot-password" className="mt-5 inline-block text-sm font-600 text-accent underline underline-offset-2">Reset your password</Link>
        )}
      </section>

      <section aria-labelledby="usage-heading" className="mt-8">
        <h2 id="usage-heading" className="text-xl text-ink">Production allowance</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          These amounts track the cost of making your stories, including setup and new takes. They are covered
          during free early access; they are not a bill. Usage covers the channels you own and updates as work finishes.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="card p-5">
            <h3 className="text-sm font-700 text-ink">Monthly production budget</h3>
            <p className="mt-3 text-2xl font-700 text-ink">{money(usage.spendCentsThisMonth)} <span className="text-sm font-400 text-muted">used{summary.monthlyLimit === null ? '' : ` of ${money(summary.monthlyLimit)}`}</span></p>
            {summary.monthlyLimit !== null && <UsageBar used={usage.spendCentsThisMonth} limit={summary.monthlyLimit} label="Monthly production budget used" />}
            <p className="mt-2 text-sm text-muted">{summary.monthlyRemaining === null ? 'Admin account · no personal monthly cap' : `${money(summary.monthlyRemaining)} remaining`}</p>
            <p className="mt-3 text-xs text-muted">New calendar month starts {resetDate(summary.monthlyReset)}, 00:00 UTC.</p>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-700 text-ink">Reels started today</h3>
            <p className="mt-3 text-2xl font-700 text-ink">{usage.reelsToday} <span className="text-sm font-400 text-muted">started{summary.dailyLimit === null ? '' : ` of ${summary.dailyLimit}`}</span></p>
            {summary.dailyLimit !== null && <UsageBar used={usage.reelsToday} limit={summary.dailyLimit} label="Daily reel allowance used" />}
            <p className="mt-2 text-sm text-muted">{summary.dailyRemaining === null ? 'Admin account · no personal daily cap' : `${summary.dailyRemaining} more today`}</p>
            <p className="mt-3 text-xs text-muted">Resets {resetDate(summary.dailyReset)}, 00:00 UTC.</p>
          </div>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Monthly usage includes projects started this UTC month and setup work recorded this month.
          Reels count when they are started, including unfinished or failed reels. A retry on the same reel
          can use production budget but does not start another reel. Work can also pause when the studio is busy
          or a reel reaches its own production limit.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <div><p className="font-600 text-ink">Ready for the next scene?</p><p className="mt-1 text-sm text-muted">The guide walks you from channel setup to your finished reel.</p></div>
        <Link href="/help" className="btn-secondary">Read the guide</Link>
      </div>
    </div>
  )
}
