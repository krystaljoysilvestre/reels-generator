// Founder-approved final gate transition. Mirrors the manual approve-spot-check route: the reel moves
// spot_check → approved and its story joins the channel's reference set. It does not schedule or publish.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const EXPECTED_OWNER_ID = 'e90261ce-8f45-4c9e-a749-00ab7b8fa966'
  const { getDb, reels, stories, channels, users, visualTruthBlockers } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { eq } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  transition(reel.status, 'approved')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId || channel.userId !== EXPECTED_OWNER_ID) throw new Error('reel owner mismatch')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('reel owner is not active')
  const blockers = await visualTruthBlockers(REEL_ID)
  if (blockers.length > 0) throw new Error(`visual truth blockers: ${JSON.stringify(blockers)}`)

  await db.transaction(async (tx) => {
    await tx.update(reels).set({ status: 'approved', updatedAt: new Date() }).where(eq(reels.id, REEL_ID))
    if (reel.storyId) {
      await tx.update(stories).set({ isReference: true, updatedAt: new Date() }).where(eq(stories.id, reel.storyId))
    }
  })

  const approved = await db.query.reels.findFirst({
    where: eq(reels.id, REEL_ID),
    columns: { status: true, costCents: true, renderUrl: true },
  })
  if (approved?.status !== 'approved') throw new Error('approval did not persist')
  console.log(`[audit] founder owner=${owner.id} approved reel=${REEL_ID}; storyReference=${reel.storyId ?? 'none'}; published=false; cost=${approved.costCents}c`)
  console.log(JSON.stringify(approved))
  process.exit(0)
})()
