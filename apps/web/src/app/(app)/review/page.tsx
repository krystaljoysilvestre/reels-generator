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
    with: { story: true },
  })

  if (pendingReels.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-positive-soft text-positive">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-sm font-medium text-ink">All caught up</p>
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-ink">Review queue</h1>
            <p className="text-xs text-muted">Approve or reject drafted stories</p>
          </div>
          <span className="badge bg-subtle text-muted">
            {queuePosition} of {sorted.length}
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-xl p-8">
        <ReviewCard
          reel={current}
          story={current.story!}
          remaining={sorted.length}
          allPendingIds={sorted.map((r) => r.id)}
        />
      </div>
    </div>
  )
}
