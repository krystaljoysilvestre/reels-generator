import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { getDb, channels } from '@reels/db'
import { requireAuth } from '@/lib/auth'
import { assertChannelAccess } from '@/lib/access'
import { isUuid } from '@/lib/storage-key'
import { NewChannelWizard } from './NewChannelWizard'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'New channel' }

export default async function NewChannelPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; preset?: string; trending?: string }>
}) {
  await requireAuth()
  // `preset` / `trending` are quick-start deep links from the dashboard's empty state. Both are just
  // selection hints — the wizard validates them against its own lists and ignores anything unknown.
  const { draft, preset, trending } = await searchParams

  // Resuming a saved draft (?draft=<id>): load its stored wizard state so the wizard hydrates from
  // the DB. This works even on a different browser than where it was saved (the localStorage autosave
  // doesn't), and is what makes a dashboard "Resume" reliable.
  let initialDraft: Record<string, unknown> | null = null
  let initialDraftChannelId: string | null = null
  if (draft !== undefined) {
    if (!isUuid(draft)) notFound()
    // A saved setup contains the creator's private notes and references. Check ownership before
    // loading its full state, just as we do when opening an established channel.
    await assertChannelAccess(draft)
    const db = getDb()
    const row = await db.query.channels.findFirst({ where: eq(channels.id, draft) })
    if (!row || row.status !== 'draft' || !row.draftState || typeof row.draftState !== 'object') notFound()
    initialDraft = row.draftState as Record<string, unknown>
    initialDraftChannelId = row.id
  }

  return (
    <NewChannelWizard
      initialDraft={initialDraft}
      initialDraftChannelId={initialDraftChannelId}
      initialPresetId={preset ?? null}
      initialTrendingId={trending ?? null}
    />
  )
}
