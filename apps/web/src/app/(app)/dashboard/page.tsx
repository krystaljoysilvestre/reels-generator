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

  // Per-channel reel + published counts (low N — one query each is fine)
  const stats: Record<string, { reels: number; published: number }> = {}
  for (const ch of channelRows) {
    const [total] = await db.select({ n: count() }).from(reels).where(eq(reels.channelId, ch.id))
    const [pub] = await db
      .select({ n: count() })
      .from(reels)
      .where(and(eq(reels.channelId, ch.id), eq(reels.status, 'published')))
    stats[ch.id] = { reels: total?.n ?? 0, published: pub?.n ?? 0 }
  }

  return (
    <div className="min-h-screen">
      {/* Page header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">Portfolio</h1>
            <p className="text-xs text-muted">
              {channelRows.length === 0
                ? 'No channels yet'
                : `${channelRows.length} channel${channelRows.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {channelRows.length > 0 && <CreateChannelButton />}
        </div>
      </header>

      <div className="p-8">
        {channelRows.length === 0 ? (
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {channelRows.map((ch) => (
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
        )}
      </div>
    </div>
  )
}
