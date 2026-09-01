// Operator approval for Crossroads reel #3 after editorial + cold creator review.
// Applies two deterministic creator copy edits before advancing; no paid call.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const { getDb, reels, stories, channels, users } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel?.storyId) throw new Error('reel or linked story not found')
  transition(reel.status, 'storyboard')

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const story = await db.query.stories.findFirst({ where: eq(stories.id, reel.storyId) })
  if (!story) throw new Error('story not found')
  const body = story.body
    .replace(
      'the inquiry record does not establish that a retained key caused the collision',
      'the inquiry record does not establish the popular claim that a lost key caused the collision',
    )
    .replace(
      'and after his reassignment, lookouts who asked for glasses received none',
      'and after departure, lookouts who asked for glasses received none',
    )
  if (body === story.body) throw new Error('expected copy-edit anchors were not found')

  await db.transaction(async (tx) => {
    await tx
      .update(stories)
      .set({
        body,
        logline:
          "Titanic's missing binoculars were real, but the 1912 inquiry separated a missed ice warning from the excessive speed it identified as the cause of the loss.",
        updatedAt: new Date(),
      })
      .where(eq(stories.id, story.id))
    await tx
      .update(reels)
      .set({ status: 'storyboard', updatedAt: new Date() })
      .where(eq(reels.id, REEL_ID))
  })

  console.log(`[audit] owner ${owner.id} approved story ${story.id} for reel ${REEL_ID} after deterministic copy edits`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'analyze_story' })
  console.log(`enqueued analyze_story for ${REEL_ID}`)
  process.exit(0)
})()
