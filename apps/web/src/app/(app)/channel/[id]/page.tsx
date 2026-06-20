import { getDb, channels, reels } from '@reels/db'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { ChannelAvatar } from '@/components/ChannelAvatar'
import { CreateReelButton } from './CreateReelButton'

export const dynamic = 'force-dynamic'

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  const { id } = await params
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!channel) notFound()

  const reelRows = await db.query.reels.findMany({
    where: eq(reels.channelId, id),
    orderBy: [desc(reels.createdAt)],
    with: { story: { columns: { title: true } } },
  })
  const languages = channel.languages ?? []

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="btn-ghost btn-sm -ml-1.5" title="Back to portfolio">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <ChannelAvatar name={channel.name} avatarKey={channel.avatarKey} className="h-9 w-9" textClass="text-xs" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">{channel.name}</h1>
            <p className="truncate text-xs text-muted">
              {channel.description || channel.tagline || languages.join(' · ') || 'no language set'}
            </p>
          </div>
          <Link href={`/channel/${channel.id}/details`} className="btn-secondary btn-sm" title="Channel details — niche, tone, style, captions, world, voice, music">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            Details
          </Link>
          <Link href={`/channel/${channel.id}/settings`} className="btn-secondary btn-sm" title="Edit channel settings">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Settings
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-4xl p-8">
        {/* Reels */}
        <section>
          {reelRows.length === 0 ? (
            <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
              <p className="text-sm font-medium text-ink">No reels yet</p>
              <p className="mb-4 mt-1 max-w-xs text-sm text-muted">Generate your first reel — we’ll draft a story for you to approve, then build the visuals and audio.</p>
              <CreateReelButton channelId={channel.id} />
            </div>
          ) : (
            <>
              <div className="mb-3 flex justify-end">
                <CreateReelButton channelId={channel.id} compact />
              </div>
              <div className="card divide-y divide-border">
                {reelRows.map((r) => (
                  <Link key={r.id} href={reelHref(r.status, r.id)} className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-subtle">
                    <p className="truncate text-sm font-medium text-ink">{r.story?.title ?? 'Untitled'}</p>
                    <span className={`badge ${r.status === 'failed' ? 'bg-danger-soft text-danger' : 'bg-subtle text-muted'}`}>{r.status.replace(/_/g, ' ')}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

// Where a reel row links, by status: still drafting / awaiting story approval → the review queue;
// everything past that → the storyboard (which also surfaces the render preview).
function reelHref(status: string, id: string): string {
  return status === 'drafting' || status === 'story_review' ? '/review' : `/storyboard/${id}`
}
