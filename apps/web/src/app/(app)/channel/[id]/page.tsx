import { getDb, channels, reels } from '@reels/db'
import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { ChannelAvatar } from '@/components/ChannelAvatar'
import type { ToneConfig, WorldBible, ChannelVoice } from '@reels/core'

export const dynamic = 'force-dynamic'

const TONE_KEYS: Array<keyof ToneConfig> = ['suspense', 'dread', 'pacing', 'gore', 'humor']

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
  const published = reelRows.filter((r) => r.status === 'published').length

  const tone = (channel.toneConfig ?? {}) as ToneConfig
  const world = (channel.worldBible ?? {}) as WorldBible
  const voices = (channel.voicePool ?? []) as ChannelVoice[]
  const voiceMode = (channel.voiceMode ?? 'single') as 'single' | 'per_story'
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
              {channel.description ? channel.description : languages.join(' · ') || 'no language set'}
            </p>
          </div>
          <button className="btn-secondary btn-sm" disabled title="Channel settings — coming next">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            Settings
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-4xl p-8">
        {/* Stat row */}
        <div className="mb-6 grid grid-cols-3 gap-4">
          <Stat label="Reels" value={reelRows.length} />
          <Stat label="Published" value={published} />
          <Stat label="Languages" value={languages.length} />
        </div>

        {/* Niche */}
        <section className="card mb-6 p-5">
          <SectionLabel>Niche</SectionLabel>
          <p className="mt-2 text-sm leading-relaxed text-ink/90">{channel.nicheDescription}</p>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Tone */}
          <section className="card p-5">
            <SectionLabel>Tone</SectionLabel>
            <div className="mt-3 flex flex-col gap-2.5">
              {TONE_KEYS.map((k) => {
                const v = Number(tone[k] ?? 0)
                return (
                  <div key={k} className="flex items-center gap-3">
                    <span className="w-20 text-sm capitalize text-muted">{k}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${v * 10}%` }} />
                    </div>
                    <span className="w-6 text-right font-mono text-xs tabular-nums text-ink">{v}</span>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Visual style */}
          <section className="card p-5">
            <SectionLabel>Visual style</SectionLabel>
            <p className="mt-2 text-sm leading-relaxed text-muted">{channel.stylePreset || '—'}</p>
          </section>
        </div>

        {/* Story world */}
        <section className="card mt-6 p-5">
          <SectionLabel>Story world</SectionLabel>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Meta label="Region" value={world.region} />
            <Meta label="Era" value={world.era} />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ChipList label="Canon locations" items={world.canonLocations ?? []} />
            <ChipList label="Canon objects" items={world.canonObjects ?? []} />
          </div>
          {world.vocabulary && Object.keys(world.vocabulary).length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted">Vocabulary</p>
              <dl className="mt-2 divide-y divide-border rounded-lg border border-border">
                {Object.entries(world.vocabulary).map(([term, value]) => (
                  <div key={term} className="flex gap-3 px-3 py-2 text-sm">
                    <dt className="w-1/3 font-medium text-ink">{term}</dt>
                    <dd className="flex-1 text-muted">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>

        {/* Voices */}
        <section className="card mt-6 p-5">
          <div className="flex items-center justify-between gap-2">
            <SectionLabel>Narrator voice{voices.length === 1 ? '' : 's'}</SectionLabel>
            <span className="badge bg-subtle text-muted">{voiceMode === 'single' ? 'one voice' : 'per story'}</span>
          </div>
          {voiceMode === 'per_story' ? (
            <p className="mt-3 text-sm text-muted">A voice is chosen for each reel when it&apos;s produced.</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {voices.map((v, i) => (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{v.name}</p>
                    <span className="badge bg-subtle text-muted">{v.gender}</span>
                  </div>
                  {v.description && <p className="mt-1 text-sm text-muted">{v.description}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reels */}
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <SectionLabel>Reels</SectionLabel>
          </div>
          {reelRows.length === 0 ? (
            <div className="card flex flex-col items-center justify-center px-6 py-12 text-center">
              <p className="text-sm font-medium text-ink">No reels yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted">Reel production for this channel is the next milestone.</p>
            </div>
          ) : (
            <div className="card divide-y divide-border">
              {reelRows.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-5 py-3">
                  <p className="text-sm font-medium text-ink">{r.story?.title ?? 'Untitled'}</p>
                  <span className="badge bg-subtle text-muted">{r.status.replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card px-4 py-3">
      <p className="font-mono text-xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-sm font-semibold tracking-tight text-ink">{children}</p>
}

function Meta({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink">{value || '—'}</p>
    </div>
  )
}

function ChipList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-sm text-faint">—</span>
        ) : (
          items.map((it, i) => <span key={i} className="badge bg-subtle text-muted">{it}</span>)
        )}
      </div>
    </div>
  )
}
