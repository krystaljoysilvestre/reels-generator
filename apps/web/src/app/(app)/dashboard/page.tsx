import { getDb, channels, reels, trendingNiches } from '@reels/db'
import { and, desc, eq, count, gte, sum, inArray, sql } from 'drizzle-orm'
import Link from 'next/link'
import { TrendingNichesSchema } from '@reels/core/prompts/trending-niches.v1'
import { CURATED_NICHES, trendingId } from '../channel/new/niche-presets'
import { CreateChannelButton } from './CreateChannelButton'
import { ChannelAvatar, avatarGlow } from '@/components/ChannelAvatar'
import { KendrixMark } from '@/components/Wordmark'
import { requireUser } from '@/lib/auth'

// The gradients the three quick-start tiles cycle through, in order.
const QUICK_START_TONES = ['bg-pair-purple-pink', 'bg-pair-blue-violet', 'bg-pair-pink-orange'] as const

interface QuickStart {
  key: string
  href: string
  label: string
  blurb: string
  /** Only set for live trending rows, where `rpm` is real data. Curated presets carry no claim. */
  badge: 'High payout' | 'Rising' | null
  title?: string
}

/**
 * The empty state's "start from a proven niche" cards.
 *
 * Prefers the LIVE trending rail — the same rows the wizard's rail shows, read straight from the
 * `trending_niches` cache so a dashboard load stays free and can never trigger the paid web search
 * (only the wizard's route may claim a day). When the cache is cold we fall back to curated presets
 * and drop the badges: "High payout" is a claim, and we only make it when the data says so.
 */
async function loadQuickStarts(db: ReturnType<typeof getDb>): Promise<QuickStart[]> {
  try {
    const [newest] = await db
      .select({ niches: trendingNiches.niches })
      .from(trendingNiches)
      .where(and(eq(trendingNiches.segment, 'global'), sql`${trendingNiches.niches} is not null`))
      .orderBy(desc(trendingNiches.day))
      .limit(1)
    const parsed = TrendingNichesSchema.safeParse({ niches: newest?.niches })
    if (parsed.success && parsed.data.niches.length > 0) {
      return parsed.data.niches.slice(0, 3).map((n) => ({
        key: n.label,
        href: `/channel/new?trending=${encodeURIComponent(trendingId(n.label))}`,
        label: n.label,
        blurb: n.blurb,
        badge: n.rpm === 'high' ? 'High payout' : 'Rising',
        title: n.whyNow,
      }))
    }
  } catch {
    /* cache unreadable — the curated fallback below always works */
  }
  return CURATED_NICHES.slice(0, 3).map((p) => ({
    key: p.id,
    href: `/channel/new?preset=${encodeURIComponent(p.id)}`,
    label: p.label,
    blurb: p.blurb,
    badge: null,
  }))
}

const HOW_IT_WORKS = [
  { n: 1, title: 'Set up a channel', copy: 'Choose its voice, sound and look once.', tone: 'bg-pair-blue-purple' },
  { n: 2, title: 'Start your first reel', copy: 'Keep the script from setup, or bring a new idea.', tone: 'bg-pair-blue-violet' },
  { n: 3, title: 'Review your story', copy: 'Shape the script and scenes, then watch the finished cut.', tone: 'bg-pair-purple-pink' },
  { n: 4, title: 'Download & post', copy: 'Download your video, cover and caption. Post wherever you share stories.', tone: 'bg-pair-pink-orange' },
] as const

export const dynamic = 'force-dynamic'

// Matches the sidebar item that leads here, not the "Portfolio" heading on the page.
export const metadata = { title: 'Channels' }

export default async function DashboardPage() {
  const user = await requireUser()
  const isAdmin = user.role === 'admin'
  const db = getDb()

  // Testers see only their own channels; admins see the whole portfolio.
  const channelRows = await db.query.channels.findMany({
    where: user.role === 'admin' ? undefined : eq(channels.userId, user.id),
    orderBy: [desc(channels.createdAt)],
  })

  // Drafts are unfinished wizards saved for later — shown separately, resumed (not opened), and never
  // counted as real channels.
  const activeRows = channelRows.filter((ch) => ch.status !== 'draft')
  const draftRows = channelRows.filter((ch) => ch.status === 'draft')

  // Per-channel reel + published counts, ready-to-post, and month-to-date spend (active only; drafts
  // have none). Low N — a few queries each is fine.
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const stats: Record<string, { reels: number; published: number; ready: number; monthSpendCents: number }> = {}
  for (const ch of activeRows) {
    const [total] = await db.select({ n: count() }).from(reels).where(eq(reels.channelId, ch.id))
    const [pub] = await db
      .select({ n: count() })
      .from(reels)
      .where(and(eq(reels.channelId, ch.id), eq(reels.status, 'published')))
    const [ready] = await db
      .select({ n: count() })
      .from(reels)
      .where(and(eq(reels.channelId, ch.id), eq(reels.status, 'approved')))
    const [spend] = await db
      .select({ n: sum(reels.costCents) })
      .from(reels)
      .where(and(eq(reels.channelId, ch.id), gte(reels.createdAt, monthStart)))
    stats[ch.id] = {
      reels: total?.n ?? 0,
      published: pub?.n ?? 0,
      ready: ready?.n ?? 0,
      monthSpendCents: Number(spend?.n ?? 0),
    }
  }

  // Portfolio spend rollup (this user's channels): month-to-date from the per-channel stats, plus an
  // all-time total across the same channels.
  const portfolioMonthCents = Object.values(stats).reduce((a, s) => a + s.monthSpendCents, 0)
  const activeIds = activeRows.map((ch) => ch.id)
  let portfolioAllTimeCents = 0
  if (activeIds.length) {
    const [tot] = await db.select({ n: sum(reels.costCents) }).from(reels).where(inArray(reels.channelId, activeIds))
    portfolioAllTimeCents = Number(tot?.n ?? 0)
  }

  const isEmpty = activeRows.length === 0 && draftRows.length === 0
  // Only the empty state shows these, so don't pay the query on a populated portfolio.
  const quickStarts = isEmpty ? await loadQuickStarts(db) : []
  const subtitle = isEmpty
    ? 'No channels yet'
    : [
        activeRows.length > 0 ? `${activeRows.length} channel${activeRows.length === 1 ? '' : 's'}` : null,
        draftRows.length > 0 ? `${draftRows.length} draft${draftRows.length === 1 ? '' : 's'}` : null,
        isAdmin && portfolioMonthCents > 0 ? `$${(portfolioMonthCents / 100).toFixed(2)} this month` : null,
        isAdmin && portfolioAllTimeCents > 0 ? `$${(portfolioAllTimeCents / 100).toFixed(2)} all-time` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-5 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-700 -tracking-[0.02em] text-ink">Portfolio</h1>
            <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
          </div>
          {/* Shown even when empty — the mock keeps the header CTA, and the hero's is the louder one. */}
          <CreateChannelButton />
        </div>
      </header>

      <div className="space-y-10 p-8">
        {!isAdmin && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent-ring bg-accent-soft px-4 py-3 text-sm">
            <p className="text-ink"><span className="font-600">Free early access.</span> No card needed. Your allowance covers production while we improve Kendrix.</p>
            <Link href="/account" className="whitespace-nowrap font-600 text-accent hover:underline">View your allowance</Link>
          </div>
        )}
        {isEmpty ? (
          <div className="mx-auto w-full max-w-[900px]">
            {/* Hero — the dark plum stage with the floating K. Same motif as the auth panes. */}
            <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#160D28,#2A1650_55%,#3D1A54)] px-8 py-12 text-night-ink shadow-lg sm:px-12 sm:py-[52px]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(460px_300px_at_88%_-12%,rgba(255,45,155,0.4),transparent_62%),radial-gradient(420px_320px_at_6%_118%,rgba(47,164,255,0.32),transparent_60%)]" />
              {/* Floating mark + aura — hidden on small screens where the copy needs the width. */}
              <div className="pointer-events-none absolute right-12 top-1/2 hidden -translate-y-1/2 lg:block">
                <div className="relative flex h-[132px] w-[132px] items-center justify-center">
                  <span className="absolute -inset-6 rounded-full bg-[radial-gradient(circle,rgba(155,59,255,0.6),transparent_70%)] animate-aura-pulse" />
                  <KendrixMark size={132} className="relative animate-k-float drop-shadow-[0_16px_44px_rgba(155,59,255,0.55)]" />
                </div>
              </div>
              <div className="relative max-w-[460px]">
                <p className="mono-label gradient-text !text-[11px] tracking-[0.2em]">Let&apos;s make your first channel</p>
                <h2 className="mt-3 font-display text-[33px] font-900 leading-[1.06] -tracking-[0.025em]">
                  Your first story
                  <br />
                  starts here.
                </h2>
                <p className="mt-4 max-w-[400px] text-[15px] leading-relaxed text-night-body">
                  A channel is one publishing brand — its niche, voice, look and rules. Set one up once and
                  Kendrix turns ideas into publish-ready reels.
                </p>
                <div className="mt-7 flex flex-wrap items-center gap-3">
                  <CreateChannelButton label="Create your first channel" className="btn-lg btn-glow" />
                  <Link
                    href="/help"
                    className="btn gap-2 rounded-md border border-white/[0.18] bg-white/[0.06] px-[18px] py-[13px] text-sm font-600 text-white hover:-translate-y-px hover:bg-white/10"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M9 18h6M10 21h4M9 14a6 6 0 1 1 6 0v1H9z" />
                    </svg>
                    Read the quick guide
                  </Link>
                </div>
              </div>
            </div>

            {/* Quick-start on-ramps — the real presets are picked on step 1 of the wizard. */}
            <section className="mt-9">
              <div className="mb-3.5 flex items-baseline justify-between gap-3">
                <h2 className="mono-label">Find a starting point</h2>
                <span className="text-xs text-faint">or describe your own in setup</span>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
                {quickStarts.map((q, i) => (
                  <Link
                    key={q.key}
                    href={q.href}
                    title={q.title}
                    className="card group flex flex-col p-[18px] transition-all hover:-translate-y-0.5 hover:border-accent-ring hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`flex h-10 w-10 items-center justify-center rounded-md ${QUICK_START_TONES[i % QUICK_START_TONES.length]}`}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M23 6l-9.5 9.5-5-5L1 18" />
                          <path d="M17 6h6v6" />
                        </svg>
                      </span>
                      {q.badge && (
                        <span
                          className={`badge font-mono text-[9px] font-700 uppercase tracking-micro ${
                            q.badge === 'Rising' ? 'bg-subtle-strong text-muted' : 'bg-success-soft text-success'
                          }`}
                        >
                          {q.badge}
                        </span>
                      )}
                    </div>
                    <p className="mt-3.5 text-[15px] font-700 text-ink">{q.label}</p>
                    <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-muted">{q.blurb}</p>
                  </Link>
                ))}
              </div>
            </section>

            {/* How it works — sets the expectation that setup is once, not per reel. */}
            <section className="mt-9">
              <h2 className="micro-label mb-3.5">How it works</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {HOW_IT_WORKS.map((s) => (
                  <div key={s.n} className="flex flex-col gap-2">
                    <span className={`flex h-[26px] w-[26px] items-center justify-center rounded-sm font-mono text-xs font-700 text-white ${s.tone}`}>
                      {s.n}
                    </span>
                    <p className="text-[13.5px] font-700 text-ink">{s.title}</p>
                    <p className="text-xs leading-snug text-muted">{s.copy}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <>
            {/* Drafts — unfinished setups, click to resume in the wizard */}
            {draftRows.length > 0 && (
              <section>
                <h2 className="micro-label mb-3.5">Drafts</h2>
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {draftRows.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/channel/new?draft=${ch.id}`}
                      className="card group flex flex-col border-[1.5px] border-dashed border-[#D6D1E6] p-4 transition-all hover:border-accent-ring hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <ChannelAvatar name={ch.name} avatarKey={ch.avatarKey} className="h-[38px] w-[38px]" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-600 text-ink">{ch.name}</p>
                            <span className="flex-shrink-0 rounded-2xl bg-subtle-strong px-[7px] py-0.5 text-[9px] font-700 uppercase tracking-[0.08em] text-muted">
                              Draft
                            </span>
                          </div>
                          <p className="truncate text-xs text-faint">Setup in progress</p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-[13px] leading-snug text-muted">{ch.nicheDescription || 'No details yet.'}</p>
                      <div className="mt-auto flex items-center gap-1.5 pt-3 text-xs font-600 text-accent">
                        Resume setup
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="transition-transform group-hover:translate-x-0.5">
                          <path d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {/* Active channels */}
            {activeRows.length > 0 && (
              <section>
                {draftRows.length > 0 && <h2 className="micro-label mb-3.5">Channels</h2>}
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                  {activeRows.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/channel/${ch.id}`}
                      className="card-channel group flex flex-col p-[17px] transition-shadow hover:shadow-md"
                      style={{ '--card-glow': avatarGlow(ch.name) } as React.CSSProperties}
                    >
                      <div className="relative z-10 flex items-center gap-3">
                        <ChannelAvatar name={ch.name} avatarKey={ch.avatarKey} className="h-10 w-10" rounded="rounded-md" textClass="text-[15px]" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-600 text-ink">{ch.name}</p>
                          <p className="truncate text-xs text-faint">{(ch.languages ?? []).join(' · ') || 'no language set'}</p>
                        </div>
                      </div>
                      <p className="relative z-10 mt-3 line-clamp-2 text-[13px] leading-snug text-muted">{ch.description || ch.nicheDescription || 'No description yet.'}</p>
                      {/* mt-auto pins the stats row to the card's bottom, so cards with
                          one-line and two-line descriptions still align across the grid. */}
                      <div className="relative z-10 mt-auto flex items-center gap-4 border-t border-border-soft pt-3 text-xs text-faint">
                        <span><span className="mono-value text-ink">{stats[ch.id]?.reels ?? 0}</span> reels</span>
                        <span><span className="mono-value text-ink">{stats[ch.id]?.published ?? 0}</span> published</span>
                        {(stats[ch.id]?.ready ?? 0) > 0 && (
                          <span className="badge bg-accent-soft text-accent">{stats[ch.id]!.ready} to post</span>
                        )}
                        {isAdmin && (stats[ch.id]?.monthSpendCents ?? 0) > 0 && (
                          <span className="ml-auto mono-value text-muted" title="What this month's reels cost to make">
                            ${((stats[ch.id]?.monthSpendCents ?? 0) / 100).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}

                  {/* New-channel tile — the mock's dashed companion to the grid */}
                  <div className="flex min-h-[150px] items-center justify-center rounded-lg border-[1.5px] border-dashed border-[#DAD5E8] bg-[#FCFBFE] p-[17px]">
                    <CreateChannelButton variant="tile" />
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
