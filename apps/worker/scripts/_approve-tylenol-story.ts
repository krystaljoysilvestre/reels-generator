// Operator approval for Crossroads reel #4 after evidence-fidelity and editorial review.
// Replaces the two source-unsafe claims caught by the gate, then advances to storyboarding.
// The copy edit itself is deterministic and free; downstream steps retain their normal budget gates.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const { getDb, reels, stories, channels, users } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { eq } = await import('drizzle-orm')

  const REVISED_BODY = `Between September 30 and October 2, 1982, seven deaths were reported in the Chicago suburbs after people swallowed Extra-Strength Tylenol capsules laced with cyanide. The source of the poison was unknown. That left one brutal question: could any Tylenol capsule stay on a shelf while the source remained unknown? Johnson & Johnson formed a Strategy Committee of top management. Its recorded decision was to remove Tylenol capsules from the market, stop advertising the product, and halt capsule manufacturing until tamper-resistant packaging could be developed. McNeil's nationwide withdrawal ultimately covered every Tylenol and Cotylenol capsule not in a blister pack: 31 million bottles. Johnson & Johnson estimated warnings, recall, testing, and destruction at $100 million. The withdrawal did not identify the poisoner. It also did not single-handedly create federal rules. On November 5, FDA published tamper-resistant packaging requirements for most over-the-counter products; Congress enacted the Federal Anti-Tampering Act in 1983. Two separate decisions answered the same crisis: when certainty was impossible, what risk should remain on the shelf?`

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
  if (!story.body.includes('stopped manufacturing entirely')) {
    throw new Error('expected manufacturing-overstatement anchor was not found')
  }
  if (!story.body.includes('amplified pressure for those federal rules')) {
    throw new Error('expected unsupported-causality anchor was not found')
  }

  await db.transaction(async (tx) => {
    await tx
      .update(stories)
      .set({
        body: REVISED_BODY,
        logline:
          "In 1982, Johnson & Johnson's Tylenol Strategy Committee chose a nationwide capsule withdrawal while the poisoner remained unknown; federal tamper-resistant packaging rules followed within weeks.",
        updatedAt: new Date(),
      })
      .where(eq(stories.id, story.id))
    await tx
      .update(reels)
      .set({ status: 'storyboard', updatedAt: new Date() })
      .where(eq(reels.id, REEL_ID))
  })

  console.log(`[audit] owner ${owner.id} approved story ${story.id} for reel ${REEL_ID} after source-safe copy edits`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'analyze_story' })
  console.log(`enqueued analyze_story for ${REEL_ID}`)
  process.exit(0)
})()
