import { getDb, channels, reels, stories } from '@reels/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requiresEvidence, resolveChannelPolicy, PostingRulesSchema, UNSHIPPED_REEL_STATUSES, autoProduceBacklogCap, budgetCapForSeconds, estimateStoryboardCents } from '@reels/core'
import { assertChannelAccess } from '@/lib/access'
import { ChannelAvatar, avatarGradient } from '@/components/ChannelAvatar'
import { ReelStatusPill } from '@/components/ReelStatusPill'
import { CreateReelButton } from './CreateReelButton'
import { channelMetadata } from '@/lib/page-metadata'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return channelMetadata((await params).id)
}

export default async function ChannelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await assertChannelAccess(id)
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!channel) notFound()
  const requiresSources = requiresEvidence(resolveChannelPolicy(null, null, channel))

  const reelRows = await db.query.reels.findMany({
    where: eq(reels.channelId, id),
    orderBy: [desc(reels.createdAt)],
    with: { story: { columns: { title: true } } },
  })
  const languages = channel.languages ?? []

  // A peek at the story shelf — setup samples and anything the creator saved since. `origin` is what
  // decides (not a reel join): pipeline stories are reel artifacts, and every regeneration round leaves
  // another abandoned draft behind. The full shelf, with editing, lives at /channel/<id>/scripts.
  const savedScripts = await db.query.stories.findMany({
    where: and(eq(stories.channelId, id), inArray(stories.origin, ['setup', 'library'])),
    orderBy: [desc(stories.createdAt)],
    columns: { id: true, title: true, body: true, source: true },
    with: { reels: { columns: { id: true } } },
  })
  // Only unused stories can start a reel (one story, one reel) — offer those in the create-reel modal.
  const reusableScripts = savedScripts
    .filter((s) => s.reels.length === 0)
    .map((s) => ({ id: s.id, title: s.title, source: s.source }))
  // The setup script the wizard left behind is a production option only when the channel does not
  // require evidence. On a factual channel it stays on the shelf as a voice preview/note.
  const firstScript = requiresSources ? null : (reusableScripts[0] ?? null)
  // What the creator is about to spend, named before they commit: an estimate to the storyboard gate,
  // and the enforced ceiling for the whole reel (a cap the pipeline actually halts on, not a guess).
  const storyboardCents = estimateStoryboardCents(channel.targetSeconds)
  const reelCapCents = budgetCapForSeconds(channel.targetSeconds)

  // Production status strip: what's ready to post, and whether auto-produce is paused on backlog —
  // the same math the scheduler uses, so "paused" here is exactly when the worker skips the channel.
  const readyCount = reelRows.filter((r) => r.status === 'approved').length
  const rules = PostingRulesSchema.safeParse(channel.postingRules ?? {})
  const autoProduce = rules.success ? rules.data.autoProduce : null
  const unshippedCount = reelRows.filter((r) => (UNSHIPPED_REEL_STATUSES as readonly string[]).includes(r.status)).length
  const producePaused = !!autoProduce?.enabled && unshippedCount >= autoProduceBacklogCap(autoProduce.reelsPerDay)
  // This month's spend across the channel's reels (channel creation cost excluded — that's one-time).
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))
  const monthSpendCents = reelRows
    .filter((r) => r.createdAt >= monthStart)
    .reduce((sum, r) => sum + r.costCents, 0)

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
        {/* Channel banner — the channel's identity + the numbers that matter, in one dark plum block */}
        <div className="relative mb-5 overflow-hidden rounded-xl px-7 py-6 text-white" style={{ background: 'linear-gradient(120deg,#2A1240,#4A1A5E 55%,#6B1746)' }}>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(320px 180px at 90% -20%,rgba(255,45,155,0.5),transparent 65%), radial-gradient(280px 200px at 15% 130%,rgba(155,59,255,0.5),transparent 65%)',
            }}
          />
          <div className="relative flex flex-wrap items-center gap-x-8 gap-y-5">
            <div className="min-w-0">
              <p className="text-[11px] font-600 uppercase tracking-micro text-white/65">
                {[channel.genreCategory?.replace(/_/g, ' '), ...languages].filter(Boolean).join(' · ') || 'no genre set'}
              </p>
              <p className="mt-1 text-xl font-700">
                {autoProduce?.enabled
                  ? `Making ${autoProduce.reelsPerDay === 1 ? '1 reel' : `${autoProduce.reelsPerDay} reels`} a day`
                  : channel.tagline || 'Producing on request'}
              </p>
            </div>
            <div className="flex-1" />
            <div className="flex items-stretch gap-7">
              <div>
                <p className="font-mono text-2xl font-400 tabular-nums">{reelRows.length}</p>
                <p className="text-[11px] tracking-[0.04em] text-white/60">REELS</p>
              </div>
              <div className="w-px bg-white/[0.16]" />
              <div>
                <p className="font-mono text-2xl font-400 tabular-nums">{reelRows.filter((r) => r.status === 'published').length}</p>
                <p className="text-[11px] tracking-[0.04em] text-white/60">PUBLISHED</p>
              </div>
              <div className="w-px bg-white/[0.16]" />
              <div title="What this month's reels cost to make">
                <p className="font-mono text-2xl font-400 tabular-nums">${(monthSpendCents / 100).toFixed(2)}</p>
                <p className="text-[11px] tracking-[0.04em] text-white/60">SPEND · MTD</p>
              </div>
            </div>
          </div>
        </div>

        {/* Production status — pause warnings first, then the quiet facts */}
        {producePaused && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-warning" aria-hidden>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
            <p className="text-sm text-ink">
              <span className="font-semibold">New reels are on hold</span> — {unshippedCount} are waiting to be posted.
              Post or clear a few and production resumes on its own.
            </p>
          </div>
        )}
        {(readyCount > 0 || autoProduce?.enabled || monthSpendCents > 0) && (
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            {readyCount > 0 && (
              <span className="badge bg-accent-soft text-accent">{readyCount === 1 ? '1 reel ready to post' : `${readyCount} reels ready to post`}</span>
            )}
            {autoProduce?.enabled && !producePaused && (
              <span className="badge bg-subtle text-muted">making {autoProduce.reelsPerDay === 1 ? '1 reel' : `${autoProduce.reelsPerDay} reels`} a day</span>
            )}
            {monthSpendCents > 0 && (
              <span className="badge bg-subtle text-muted" title="What this month's reels cost to make">${(monthSpendCents / 100).toFixed(2)} this month</span>
            )}
          </div>
        )}
        {/* Reels */}
        <section>
          {reelRows.length === 0 ? (
            /* First-reel moment. When setup left a script behind, the wizard's story continues here —
               name it and offer it as the obvious first production, rather than a generic "create". */
            <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
              {firstScript ? (
                <>
                  <p className="text-sm font-medium text-ink">Your first script is ready</p>
                  <p className="mt-1 max-w-sm text-sm text-muted">
                    “{firstScript.title}” — written in this channel’s voice during setup. Turn it into your first reel,
                    or start a new one.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-ink">No reels yet</p>
                  <p className="mt-1 max-w-xs text-sm text-muted">Create your first reel — we’ll draft a story for you to approve, then build the picture and sound.</p>
                </>
              )}
              <div className="mt-4">
                <CreateReelButton
                  channelId={channel.id}
                  promptMode
                  channelMode={channel.generationMode === 'auto' ? 'auto' : 'review'}
                  savedScripts={reusableScripts}
                  storyboardCents={storyboardCents}
                  reelCapCents={reelCapCents}
                  isEbn={channel.storyMode === 'ebn'}
                  factCheck={channel.factCheck}
                  requiresSources={requiresSources}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="mb-3.5 flex items-center justify-between gap-3">
                <h2 className="font-display text-[15px] font-700 text-ink">Reels</h2>
                <CreateReelButton
                  channelId={channel.id}
                  compact
                  channelMode={channel.generationMode === 'auto' ? 'auto' : 'review'}
                  savedScripts={reusableScripts}
                  storyboardCents={storyboardCents}
                  reelCapCents={reelCapCents}
                  isEbn={channel.storyMode === 'ebn'}
                  factCheck={channel.factCheck}
                  requiresSources={requiresSources}
                />
              </div>
              <div className="card overflow-hidden divide-y divide-border-soft">
                {reelRows.map((r) => (
                  <Link
                    key={r.id}
                    href={reelHref(r.status, r.id)}
                    className="flex items-center gap-3.5 px-[18px] py-3 transition-colors hover:bg-row-hover"
                  >
                    {/* 9:16 thumb — the shape the reel will be, tinted per reel */}
                    <span
                      className="relative h-12 w-[34px] flex-shrink-0 overflow-hidden rounded-[7px]"
                      style={{ background: avatarGradient(r.story?.title ?? r.id) }}
                    >
                      <span
                        className="absolute inset-0"
                        style={{ background: 'radial-gradient(circle at 40% 25%,rgba(255,255,255,0.3),transparent 60%)' }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-600 text-ink">{r.story?.title ?? 'Untitled'}</span>
                      <span className="block truncate text-xs text-faint">{relativeDay(r.createdAt)}</span>
                    </span>
                    {r.alertNote && (
                      <span className="badge flex-shrink-0 bg-warning-soft text-warning" title={r.alertNote}>needs attention</span>
                    )}
                    <ReelStatusPill status={r.status} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Saved stories — a peek at the shelf, so the creator can see their setup script landed */}
        {savedScripts.length > 0 && (
          <section className="mt-8">
            <div className="mb-3.5 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-[15px] font-700 text-ink">Saved scripts</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {requiresSources
                    ? 'Voice references and notes — factual reels start from source material.'
                    : 'The voice this channel starts from — ready to become reels.'}
                </p>
              </div>
              <Link href={`/channel/${channel.id}/scripts`} className="btn-secondary btn-sm">See all scripts</Link>
            </div>
            <div className="card overflow-hidden divide-y divide-border-soft">
              {savedScripts.slice(0, 4).map((s) => (
                <details key={s.id} className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3.5 px-[18px] py-3 transition-colors hover:bg-row-hover [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-600 text-ink">{s.title}</span>
                    </span>
                    <span className="badge flex-shrink-0 bg-subtle text-muted">
                      {s.source === 'user' ? 'written by you' : 'written for you'}
                    </span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-faint transition-transform group-open:rotate-180" aria-hidden>
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="border-t border-border-soft px-[18px] py-4">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{s.body}</p>
                  </div>
                </details>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// Where a reel row links, by status: still drafting / awaiting story approval → the review queue;
// everything past that → the storyboard (which also surfaces the render preview).
function reelHref(status: string, id: string): string {
  return status === 'drafting' || status === 'story_review' ? '/review' : `/storyboard/${id}`
}

// Plain-language age for a reel row — the mock's meta line, from the data we actually have.
function relativeDay(at: Date): string {
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000)
  if (days <= 0) return 'Started today'
  if (days === 1) return 'Started yesterday'
  if (days < 30) return `Started ${days} days ago`
  const months = Math.round(days / 30)
  return `Started ${months} month${months === 1 ? '' : 's'} ago`
}
