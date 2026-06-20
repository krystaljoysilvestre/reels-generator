import { getDb, channels, reels } from '@reels/db'
import { and, desc, eq, count } from 'drizzle-orm'
import Link from 'next/link'
import { CreateChannelButton } from './CreateChannelButton'
import { ChannelAvatar } from '@/components/ChannelAvatar'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const db = getDb()

  const channelRows = await db.query.channels.findMany({
    orderBy: [desc(channels.createdAt)],
  })

  // Drafts are unfinished wizards saved for later — shown separately, resumed (not opened), and never
  // counted as real channels.
  const activeRows = channelRows.filter((ch) => ch.status !== 'draft')
  const draftRows = channelRows.filter((ch) => ch.status === 'draft')

  // Per-channel reel + published counts (active only; drafts have none). Low N — one query each is fine.
  const stats: Record<string, { reels: number; published: number }> = {}
  for (const ch of activeRows) {
    const [total] = await db.select({ n: count() }).from(reels).where(eq(reels.channelId, ch.id))
    const [pub] = await db
      .select({ n: count() })
      .from(reels)
      .where(and(eq(reels.channelId, ch.id), eq(reels.status, 'published')))
    stats[ch.id] = { reels: total?.n ?? 0, published: pub?.n ?? 0 }
  }

  const isEmpty = activeRows.length === 0 && draftRows.length === 0
  const subtitle = isEmpty
    ? 'No channels yet'
    : [
        activeRows.length > 0 ? `${activeRows.length} channel${activeRows.length === 1 ? '' : 's'}` : null,
        draftRows.length > 0 ? `${draftRows.length} draft${draftRows.length === 1 ? '' : 's'}` : null,
      ]
        .filter(Boolean)
        .join(' · ')

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">Portfolio</h1>
            <p className="text-xs text-muted">{subtitle}</p>
          </div>
          {!isEmpty && <CreateChannelButton />}
        </div>
      </header>

      <div className="space-y-10 p-8">
        {isEmpty ? (
          <div className="card flex flex-col items-center justify-center px-6 py-20 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-subtle text-faint">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path d="M3 9h18M7 5V3M17 5V3" />
              </svg>
            </div>
            <p className="text-base font-semibold tracking-tight text-ink">Build your first channel</p>
            <p className="mt-1.5 max-w-sm text-sm text-muted">
              A channel is one publishing brand — its niche, voice, look, and posting rules.
              The pipeline turns a niche into publish-ready videos for it.
            </p>
            <div className="mt-6">
              <CreateChannelButton />
            </div>
          </div>
        ) : (
          <>
            {/* Drafts — unfinished setups, click to resume in the wizard */}
            {draftRows.length > 0 && (
              <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Drafts</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {draftRows.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/channel/new?draft=${ch.id}`}
                      className="card group flex flex-col border-dashed p-5 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <ChannelAvatar name={ch.name} avatarKey={ch.avatarKey} className="h-10 w-10" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-semibold text-ink">{ch.name}</p>
                            <span className="flex-shrink-0 rounded-full bg-subtle px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                              Draft
                            </span>
                          </div>
                          <p className="truncate text-xs text-muted">Setup in progress</p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-muted">{ch.nicheDescription || 'No details yet.'}</p>
                      <div className="mt-4 flex items-center gap-1.5 border-t border-border pt-3 text-xs font-medium text-accent">
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
                {draftRows.length > 0 && (
                  <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Channels</h2>
                )}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {activeRows.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/channel/${ch.id}`}
                      className="card group flex flex-col p-5 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <ChannelAvatar name={ch.name} avatarKey={ch.avatarKey} className="h-10 w-10" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{ch.name}</p>
                          <p className="truncate text-xs text-muted">{(ch.languages ?? []).join(' · ') || 'no language set'}</p>
                        </div>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-muted">{ch.description || ch.nicheDescription || 'No description yet.'}</p>
                      <div className="mt-4 flex items-center gap-4 border-t border-border pt-3 text-xs text-muted">
                        <span><span className="font-mono tabular-nums text-ink">{stats[ch.id]?.reels ?? 0}</span> reels</span>
                        <span className="text-faint">·</span>
                        <span><span className="font-mono tabular-nums text-ink">{stats[ch.id]?.published ?? 0}</span> published</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
