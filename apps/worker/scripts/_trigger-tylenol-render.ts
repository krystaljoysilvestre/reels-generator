// Operator approval of the final Tylenol storyboard into the normal render chain.
import '../src/env.js'

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const VOICE_ID = 'j9jfwdrw7BRfcR43Qohk' // Frederick Surrey — Crossroads channel continuity
  const { getDb, reels, channels, users, visualTruthBlockers } = await import('@reels/db')
  const { transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { eq } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel) throw new Error('reel not found')
  transition(reel.status, 'rendering')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')
  if (!(channel.voicePool ?? []).some((voice) => voice.providerId === VOICE_ID)) {
    throw new Error('continuity voice is no longer in the channel voice pool')
  }
  const blockers = await visualTruthBlockers(REEL_ID)
  if (blockers.length > 0) throw new Error(`visual truth blockers: ${JSON.stringify(blockers)}`)

  await db
    .update(reels)
    .set({
      status: 'rendering',
      voiceId: VOICE_ID,
      alertNote: null,
      updatedAt: new Date(),
    })
    .where(eq(reels.id, REEL_ID))
  console.log(`[audit] owner ${owner.id} approved final storyboard for reel ${REEL_ID}; voice=${VOICE_ID}`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'generate_tts' })
  console.log('enqueued generate_tts')
  process.exit(0)
})()
