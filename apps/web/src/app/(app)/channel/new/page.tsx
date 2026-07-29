import { eq } from 'drizzle-orm'
import { getDb, channels } from '@reels/db'
import { requireAuth } from '@/lib/auth'
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
  if (draft) {
    const db = getDb()
    const row = await db.query.channels.findFirst({ where: eq(channels.id, draft) })
    if (row && row.status === 'draft' && row.draftState && typeof row.draftState === 'object') {
      initialDraft = row.draftState as Record<string, unknown>
      initialDraftChannelId = row.id
    }
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
