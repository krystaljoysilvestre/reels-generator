import { getDb, channels, stories } from '@reels/db'
import { and, desc, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { assertChannelAccess } from '@/lib/access'
import { ChannelAvatar } from '@/components/ChannelAvatar'
import { channelMetadata } from '@/lib/page-metadata'
import { AddScriptButton } from './AddScriptButton'
import { ScriptRow } from './ScriptRow'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return channelMetadata((await params).id, 'Scripts')
}

// The channel's script shelf: setup samples, scripts the creator saved, and ones we wrote for them.
// (Stored in `stories` — "script" is what a creator calls the text they hand over; "story" stays the
// narrative inside a reel.) Pipeline-written stories are deliberately absent: they belong to their reel,
// and every regeneration round leaves another abandoned draft behind, so `origin` decides what shows here.
export default async function ChannelScriptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await assertChannelAccess(id)
  const db = getDb()

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, id) })
  if (!channel) notFound()

  const rows = await db.query.stories.findMany({
    where: and(eq(stories.channelId, id), inArray(stories.origin, ['setup', 'library'])),
    orderBy: [desc(stories.createdAt)],
    columns: { id: true, title: true, body: true, source: true, origin: true, isReference: true },
    with: { reels: { columns: { id: true, status: true } } },
  })

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-border bg-bg/80 px-8 py-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link href={`/channel/${channel.id}`} className="btn-ghost btn-sm -ml-1.5" title="Back to channel">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <ChannelAvatar name={channel.name} avatarKey={channel.avatarKey} className="h-9 w-9" textClass="text-xs" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight text-ink">Scripts</h1>
            <p className="truncate text-xs text-muted">{channel.name}</p>
          </div>
          <AddScriptButton channelId={channel.id} isEbn={channel.storyMode === 'ebn'} />
        </div>
      </header>

      <div className="mx-auto max-w-4xl p-8">
        {rows.length === 0 ? (
          <div className="card flex flex-col items-center justify-center px-6 py-14 text-center">
            <p className="text-sm font-medium text-ink">No scripts saved yet</p>
            <p className="mb-4 mt-1 max-w-sm text-sm text-muted">
              Keep your scripts here — write your own, or have one written in this channel&apos;s voice. Turn any of
              them into a reel when you&apos;re ready.
            </p>
            <AddScriptButton channelId={channel.id} isEbn={channel.storyMode === 'ebn'} prominent />
          </div>
        ) : (
          <>
            <p className="mb-3.5 text-xs text-muted">
              {rows.length === 1 ? '1 script' : `${rows.length} scripts`} · ready when you are
            </p>
            <div className="card overflow-hidden divide-y divide-border-soft">
              {rows.map((s) => (
                <ScriptRow
                  key={s.id}
                  script={{ id: s.id, title: s.title, body: s.body, source: s.source, isReference: s.isReference }}
                  channelId={channel.id}
                  reel={s.reels[0] ? { id: s.reels[0].id, status: s.reels[0].status } : null}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
