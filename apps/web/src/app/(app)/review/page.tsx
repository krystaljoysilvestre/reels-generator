import { getDb, reels } from '@reels/db'
import { and, eq, inArray } from 'drizzle-orm'
import { ReviewCard } from './ReviewCard'
import { requireUser } from '@/lib/auth'
import { accessibleChannelIds } from '@/lib/access'

export const dynamic = 'force-dynamic'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ reelId?: string }>
}) {
  const { reelId } = await searchParams
  const user = await requireUser()
  const db = getDb()

  // Reels awaiting story review — scoped to the caller's channels (admins see all).
  const ids = await accessibleChannelIds(user)
  const pendingReels = await db.query.reels.findMany({
    where: ids === null
      ? eq(reels.status, 'story_review')
      : and(eq(reels.status, 'story_review'), inArray(reels.channelId, ids)),
    with: { story: true, channel: { columns: { name: true, avatarKey: true } } },
  })

  if (pendingReels.length === 0) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-success-soft text-success">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="font-display text-lg font-700 -tracking-[0.02em] text-ink">All caught up</p>
          <p className="mt-1 text-sm text-muted">No stories are waiting for review.</p>
        </div>
      </div>
    )
  }

  // Show the requested reel first, otherwise start at the top
  const sorted = reelId
    ? [...pendingReels].sort((a) => (a.id === reelId ? -1 : 1))
    : pendingReels

  const current = sorted[0]!
  const queuePosition = sorted.findIndex((r) => r.id === current.id) + 1

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-5 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[22px] font-700 -tracking-[0.02em] text-ink">Review queue</h1>
            <p className="mt-0.5 text-[13px] text-muted">Approve or reject drafted stories</p>
          </div>
          <span className="rounded-2xl border border-accent/[0.22] bg-brand-wash px-3 py-1.5 text-[13px] font-600 text-accent">
            <span className="font-mono tabular-nums">{queuePosition}</span> of{' '}
            <span className="font-mono tabular-nums">{sorted.length}</span>
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-xl p-8">
        {/* Stacked-cards peek — the queue behind this one */}
        <div className="relative">
          {sorted.length > 2 && (
            <div className="absolute inset-x-6 -top-3 h-3 rounded-t-lg bg-brand opacity-40" aria-hidden />
          )}
          {sorted.length > 1 && (
            <div className="absolute inset-x-3 -top-1.5 h-3 rounded-t-lg bg-brand opacity-70" aria-hidden />
          )}
          <ReviewCard
            reel={current}
            story={current.story!}
            channelName={current.channel?.name ?? ''}
            channelAvatarKey={current.channel?.avatarKey ?? null}
            remaining={sorted.length}
            allPendingIds={sorted.map((r) => r.id)}
          />
        </div>
      </div>
    </div>
  )
}
