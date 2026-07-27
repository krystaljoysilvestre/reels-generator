import { getDb, channels, reels, compilations, assets, trendingNiches, spendEvents } from '@reels/db'
import { and, count, desc, eq, gte, inArray, isNotNull, sql, sum } from 'drizzle-orm'
import Link from 'next/link'
import { DEFAULT_BUDGET_CAPS_CENTS } from '@reels/core'
import { requireAdmin } from '@/lib/auth'
import { ReelStatusPill } from '@/components/ReelStatusPill'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Costs · Admin' }

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

// Statuses that count as "shipped" for unit economics — the reel made it past every gate.
const SHIPPED_STATUSES = ['approved', 'scheduled', 'published'] as const
const SCRAPPED_STATUSES = ['rejected', 'failed'] as const

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  fal: 'fal.ai',
  anthropic: 'Anthropic',
  local: 'Local (unpaid)',
}

// spend_events.surface → creator-facing name for the capability that spent it.
const SURFACE_LABELS: Record<string, string> = {
  channel_derive: 'Channel profile (wizard)',
  channel_sample_script: 'Sample script (wizard)',
  channel_style_ref: 'Style from reference images',
  channel_style_options: 'Style proposals',
  channel_style_image: 'Style previews',
  channel_mine_rubric: 'Taste rubric (settings)',
  voice_recommend: 'Voice recommendations',
  voice_preview: 'Voice previews',
}

const KIND_LABELS: Record<string, string> = {
  image: 'Scene images',
  video: 'Animated shots',
  voiceover: 'Voiceover',
  sfx: 'Sound effects & foley',
  ambient: 'Ambience',
  music: 'Music',
  render: 'Render',
  stem: 'Mix stems',
}

export default async function AdminCostsPage() {
  await requireAdmin()
  const db = getDb()
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const DAYS = 14
  const trendStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (DAYS - 1)))

  const reelDay = sql<string>`to_char(${reels.createdAt} at time zone 'utc', 'YYYY-MM-DD')`
  const compDay = sql<string>`to_char(${compilations.createdAt} at time zone 'utc', 'YYYY-MM-DD')`

  const [
    reelAll,
    reelMonth,
    compAll,
    compMonth,
    chanAll,
    chanMonth,
    nicheAll,
    nicheMonth,
    setupAll,
    setupMonth,
    bySurface,
    shippedMonthRow,
    scrappedMonthRow,
    byKind,
    byProvider,
    assetReelScoped,
    dailyReels,
    dailyComps,
    topReels,
  ] = await Promise.all([
    db.select({ cents: sum(reels.costCents), n: count() }).from(reels),
    db.select({ cents: sum(reels.costCents), n: count() }).from(reels).where(gte(reels.createdAt, monthStart)),
    db.select({ cents: sum(compilations.costCents), n: count() }).from(compilations),
    db.select({ cents: sum(compilations.costCents), n: count() }).from(compilations).where(gte(compilations.createdAt, monthStart)),
    db.select({ cents: sum(channels.costCents) }).from(channels),
    db.select({ cents: sum(channels.costCents) }).from(channels).where(gte(channels.createdAt, monthStart)),
    db.select({ cents: sum(trendingNiches.costCents) }).from(trendingNiches),
    db.select({ cents: sum(trendingNiches.costCents) }).from(trendingNiches).where(gte(trendingNiches.createdAt, monthStart)),
    db.select({ cents: sum(spendEvents.costCents) }).from(spendEvents),
    db.select({ cents: sum(spendEvents.costCents) }).from(spendEvents).where(gte(spendEvents.createdAt, monthStart)),
    db.select({ surface: spendEvents.surface, cents: sum(spendEvents.costCents) }).from(spendEvents).groupBy(spendEvents.surface),
    db
      .select({ cents: sum(reels.costCents), n: count() })
      .from(reels)
      .where(and(gte(reels.createdAt, monthStart), inArray(reels.status, [...SHIPPED_STATUSES]))),
    db
      .select({ cents: sum(reels.costCents), n: count() })
      .from(reels)
      .where(and(gte(reels.createdAt, monthStart), inArray(reels.status, [...SCRAPPED_STATUSES]))),
    db.select({ kind: assets.kind, cents: sum(assets.costCents) }).from(assets).groupBy(assets.kind),
    db.select({ provider: assets.provider, cents: sum(assets.costCents) }).from(assets).groupBy(assets.provider),
    db.select({ cents: sum(assets.costCents) }).from(assets).where(isNotNull(assets.reelId)),
    db
      .select({ day: reelDay, cents: sum(reels.costCents) })
      .from(reels)
      .where(gte(reels.createdAt, trendStart))
      .groupBy(reelDay),
    db
      .select({ day: compDay, cents: sum(compilations.costCents) })
      .from(compilations)
      .where(gte(compilations.createdAt, trendStart))
      .groupBy(compDay),
    db
      .select({
        id: reels.id,
        status: reels.status,
        costCents: reels.costCents,
        createdAt: reels.createdAt,
        channelName: channels.name,
      })
      .from(reels)
      .innerJoin(channels, eq(reels.channelId, channels.id))
      .orderBy(desc(reels.costCents))
      .limit(10),
  ])

  const n = (v: string | number | null | undefined) => Number(v ?? 0)

  // Setup / preview / settings spend lives in the spend_events ledger; channels.costCents holds the same
  // kind of spend from before the ledger existed. They never overlap — nothing writes channels.costCents
  // now — so adding them is safe and keeps the historical figure visible.
  const sources = [
    { label: 'Reel production', month: n(reelMonth[0]?.cents), all: n(reelAll[0]?.cents) },
    { label: 'Compilations', month: n(compMonth[0]?.cents), all: n(compAll[0]?.cents) },
    {
      label: 'Setup, previews & settings',
      month: n(setupMonth[0]?.cents) + n(chanMonth[0]?.cents),
      all: n(setupAll[0]?.cents) + n(chanAll[0]?.cents),
    },
    { label: 'Topic research (trending niches)', month: n(nicheMonth[0]?.cents), all: n(nicheAll[0]?.cents) },
  ]
  const surfaceRows = bySurface
    .map((r) => ({ label: SURFACE_LABELS[r.surface] ?? r.surface, cents: n(r.cents) }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents)
  const totalMonth = sources.reduce((s, r) => s + r.month, 0)
  const totalAll = sources.reduce((s, r) => s + r.all, 0)

  // Unit economics, month-to-date. "Per shipped reel" divides ALL reel production spend (including
  // scrapped attempts) by shipped count — spend on failures is part of the true cost of a shipped reel.
  const reelsStartedMonth = n(reelMonth[0]?.n)
  const reelSpendMonth = n(reelMonth[0]?.cents)
  const shippedCount = n(shippedMonthRow[0]?.n)
  const scrappedCents = n(scrappedMonthRow[0]?.cents)
  const scrappedCount = n(scrappedMonthRow[0]?.n)
  const avgPerReel = reelsStartedMonth > 0 ? reelSpendMonth / reelsStartedMonth : null
  const perShipped = shippedCount > 0 ? reelSpendMonth / shippedCount : null

  // Media spend is itemized per asset row; story/LLM (and music, which has no asset row yet) is the
  // remainder of reel spend after reel-scoped asset spend — derived, not itemized.
  const kindRows = byKind
    .map((r) => ({ label: KIND_LABELS[r.kind] ?? r.kind, cents: n(r.cents) }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents)
  const providerRows = byProvider
    .map((r) => ({ label: PROVIDER_LABELS[r.provider] ?? r.provider, cents: n(r.cents) }))
    .filter((r) => r.cents > 0)
    .sort((a, b) => b.cents - a.cents)
  const derivedStoryCents = Math.max(0, n(reelAll[0]?.cents) - n(assetReelScoped[0]?.cents))

  // Daily spend, attributed to the reel/compilation's creation day (same convention as the budget gates).
  const dailyMap = new Map<string, number>()
  for (const r of dailyReels) dailyMap.set(r.day, (dailyMap.get(r.day) ?? 0) + n(r.cents))
  for (const r of dailyComps) dailyMap.set(r.day, (dailyMap.get(r.day) ?? 0) + n(r.cents))
  const days: { day: string; cents: number }[] = []
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i))
    const key = d.toISOString().slice(0, 10)
    days.push({ day: key, cents: dailyMap.get(key) ?? 0 })
  }
  const dailyMax = Math.max(1, ...days.map((d) => d.cents))

  const shortCap = DEFAULT_BUDGET_CAPS_CENTS.short

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-bg/80 px-8 py-5 backdrop-blur">
        <div>
          <h1 className="text-[22px] font-700 -tracking-[0.02em] text-ink">Costs</h1>
          <p className="mt-0.5 text-[13px] text-muted">
            Provider spend and per-reel economics · <Link href="/admin" className="text-accent hover:underline">back to Admin</Link>
          </p>
        </div>
        <div className="hidden overflow-hidden rounded-sm border border-border-mid bg-surface sm:block" title="Tracked provider spend this month, all sources">
          <div className="clapper-band h-2" />
          <div className="flex items-center gap-3 px-3.5 py-1.5">
            <span className="mono-label text-[9px] tracking-micro-wide">Spend · month</span>
            <span className="mono-value text-ink">{money(totalMonth)}</span>
          </div>
        </div>
      </header>

      <div className="space-y-10 p-8">
        {/* Where the money goes */}
        <section>
          <h2 className="micro-label mb-3.5">Where the money goes</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="micro-label px-4 py-2.5 font-500">Source</th>
                  <th className="micro-label px-4 py-2.5 text-right font-500">This month</th>
                  <th className="micro-label px-4 py-2.5 text-right font-500">All-time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sources.map((s) => (
                  <tr key={s.label} className="transition-colors hover:bg-row-hover">
                    <td className="px-4 py-2.5 text-ink">{s.label}</td>
                    <td className="mono-value px-4 py-2.5 text-right">{money(s.month)}</td>
                    <td className="mono-value px-4 py-2.5 text-right text-muted">{money(s.all)}</td>
                  </tr>
                ))}
                <tr className="bg-surface font-600">
                  <td className="px-4 py-2.5 text-ink">Total</td>
                  <td className="mono-value px-4 py-2.5 text-right text-ink">{money(totalMonth)}</td>
                  <td className="mono-value px-4 py-2.5 text-right">{money(totalAll)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-faint">
            Tracked spend from our per-call cost accounting (estimated per token / second / character, rounded up) —
            a close proxy for provider invoices, not a reconciliation.
          </p>
        </section>

        {/* Setup + preview spend, itemized from the ledger */}
        {surfaceRows.length > 0 && (
          <section>
            <h2 className="micro-label mb-3.5">Setup, previews &amp; settings · by capability</h2>
            <div className="card divide-y divide-border">
              {surfaceRows.map((r) => (
                <Row key={r.label} label={r.label} value={money(r.cents)} />
              ))}
            </div>
            <p className="mt-2 text-xs text-faint">
              Spend with no reel to bill — the channel wizard, voice previews, and post-creation settings work.
              Recorded per call server-side, so it counts toward budget caps like everything else.
            </p>
          </section>
        )}

        {/* Unit economics */}
        <section>
          <h2 className="micro-label mb-3.5">Unit economics · this month</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Reels started" value={String(reelsStartedMonth)} />
            <Stat
              label="Avg cost per reel"
              value={avgPerReel === null ? '—' : money(avgPerReel)}
              hint={avgPerReel === null ? 'no reels this month' : `budget cap ${money(shortCap)} per short`}
            />
            <Stat
              label="Cost per shipped reel"
              value={perShipped === null ? '—' : money(perShipped)}
              hint={
                perShipped === null
                  ? 'reads once a reel ships (approved / scheduled / published)'
                  : `${shippedCount} shipped — includes spend on attempts that didn't`
              }
            />
            <Stat
              label="Spend on scrapped attempts"
              value={money(scrappedCents)}
              hint={scrappedCount > 0 ? `${scrappedCount} rejected or failed` : 'nothing scrapped this month'}
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            The number future pricing derives from is cost per <em>shipped</em> reel — scrapped attempts are part of
            that cost, and the gap between the two averages is the margin regeneration burns.
          </p>
        </section>

        {/* Breakdown */}
        <section>
          <h2 className="micro-label mb-3.5">Production spend breakdown · all-time</h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card overflow-hidden">
              <p className="micro-label border-b border-border px-4 py-2.5">By asset type</p>
              <div className="divide-y divide-border">
                {kindRows.map((r) => (
                  <Row key={r.label} label={r.label} value={money(r.cents)} />
                ))}
                <Row label="Story, language models & music (derived)" value={money(derivedStoryCents)} muted />
              </div>
            </div>
            <div className="card overflow-hidden">
              <p className="micro-label border-b border-border px-4 py-2.5">By provider</p>
              <div className="divide-y divide-border">
                {providerRows.map((r) => (
                  <Row key={r.label} label={r.label} value={money(r.cents)} />
                ))}
                <Row label="Language models (derived, mixed providers)" value={money(derivedStoryCents)} muted />
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-faint">
            Itemized rows come from per-asset cost records. Story and language-model spend (and music, which has no
            asset record yet) is the remainder of reel spend after itemized assets — derived, not itemized.
          </p>
        </section>

        {/* Daily spend */}
        <section>
          <h2 className="micro-label mb-3.5">Daily spend · last {DAYS} days</h2>
          <div className="card divide-y divide-border">
            {days.map((d) => (
              <div key={d.day} className="flex items-center gap-3 px-4 py-1.5 text-sm">
                <span className="mono-value w-24 flex-shrink-0 text-[11px] text-muted">{d.day.slice(5)}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-sm bg-surface">
                  <div className="clapper-band h-full" style={{ width: `${(d.cents / dailyMax) * 100}%` }} />
                </div>
                <span className="mono-value w-16 flex-shrink-0 text-right text-[11px] text-ink">{money(d.cents)}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">
            Spend is attributed to the day the reel or compilation was created — the same convention the daily
            kill-switch and monthly budgets read.
          </p>
        </section>

        {/* Most expensive reels */}
        <section>
          <h2 className="micro-label mb-3.5">Most expensive reels · all-time</h2>
          <div className="card divide-y divide-border">
            {topReels.length === 0 && <p className="p-4 text-sm text-muted">No reels yet.</p>}
            {topReels.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-row-hover">
                <div className="min-w-0 truncate">
                  <span className="font-600 text-ink">{r.channelName}</span>
                  <span className="mono-value ml-2 text-[11px] text-faint">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''}
                  </span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <ReelStatusPill status={r.status} />
                  <span className="mono-value text-[11px] text-muted">{Math.round((r.costCents / shortCap) * 100)}% of cap</span>
                  <span className="mono-value w-16 text-right text-ink">{money(r.costCents)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Revenue */}
        <section>
          <h2 className="micro-label mb-3.5">Revenue</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Revenue this month" value="—" hint="not yet measured — no paid plans in Phase 0" />
            <Stat label="Revenue all-time" value="—" hint="wired when publications or plans carry revenue" />
            <Stat label="Net margin" value="—" hint="revenue − cost; the cost side above is already live" />
          </div>
          <p className="mt-2 text-xs text-faint">
            Honest empty by design: no revenue exists yet, so nothing here is estimated or mocked. When revenue
            lands, it reads against the same per-reel cost base this page already tracks.
          </p>
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

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <span className={muted ? 'text-muted' : 'text-ink'}>{label}</span>
      <span className="mono-value text-ink">{value}</span>
    </div>
  )
}
