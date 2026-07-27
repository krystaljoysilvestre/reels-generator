import type { Metadata } from 'next'
import { eq } from 'drizzle-orm'
import { getDb, channels, reels } from '@reels/db'
import { assertChannelAccess, assertReelAccess } from '@/lib/access'

// Browser titles for the pages that are ABOUT one channel or reel, so a creator with several tabs
// open can tell them apart. Both helpers run the SAME ownership guard as the page they title —
// a title is rendered content, and without the guard it would answer "does this id exist, and what
// is it called?" for anyone who guessed a URL. The root layout appends the brand.
//
// Cost: one extra guard + one name lookup per page view, on top of what the page itself loads.
// Worth it for tabs you can read; if it ever matters, wrap the guards in React `cache()` so
// generateMetadata and the page share one call.

/** Entity first, section second: "Batang Bangis · Settings" survives tab truncation better. */
function join(name: string | undefined, section: string | undefined, fallback: string): string {
  return [name?.trim() || fallback, section].filter(Boolean).join(' · ')
}

export async function channelMetadata(channelId: string, section?: string): Promise<Metadata> {
  await assertChannelAccess(channelId)
  const db = getDb()
  const row = await db
    .select({ name: channels.name })
    .from(channels)
    .where(eq(channels.id, channelId))
    .then((r) => r[0])
  return { title: join(row?.name, section, 'Channel') }
}

/** Titled by its story, which doesn't exist yet on a fresh reel — then the section stands alone. */
export async function reelMetadata(reelId: string, section: string): Promise<Metadata> {
  await assertReelAccess(reelId)
  const db = getDb()
  const row = await db.query.reels.findFirst({
    where: eq(reels.id, reelId),
    columns: { id: true },
    with: { story: { columns: { title: true } } },
  })
  const storyTitle = row?.story?.title?.trim()
  return { title: storyTitle ? `${storyTitle} · ${section}` : section }
}
