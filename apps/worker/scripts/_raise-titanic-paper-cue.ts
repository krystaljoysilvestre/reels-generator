// Final founder mix trim: the restored paper cue measured below the ambient bed. Raise only that existing
// source by 8 dB, keeping the reel-local voice duck/fade and every other visual/audio decision unchanged.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const PAPER_ANCHOR = 'Two hours before Fleet rang that bell'
  const PAPER_DB = -12

  const { getDb, reels, channels, users } = await import('@reels/db')
  const { AudioScriptSchema, TimingsSchema, transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { mixAudioStep } = await import('../src/pipeline/steps/mix-audio-step.js')
  const { eq } = await import('drizzle-orm')
  const db = getDb()
  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel?.timings || !reel.audioScript) throw new Error('reel playback data missing')
  transition(reel.status, 'rendering')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)
  let timingHits = 0
  let scriptHits = 0
  const correctedTimings = TimingsSchema.parse({
    ...timings,
    sfxEvents: timings.sfxEvents.map((event) => {
      if (event.anchor !== PAPER_ANCHOR) return event
      timingHits++
      return { ...event, volumeDb: PAPER_DB }
    }),
  })
  const correctedAudioScript = AudioScriptSchema.parse({
    ...audioScript,
    sfx: audioScript.sfx.map((cue) => {
      if (cue.anchor !== PAPER_ANCHOR) return cue
      scriptHits++
      return { ...cue, volumeDb: PAPER_DB }
    }),
  })
  if (timingHits !== 1 || scriptHits !== 1) throw new Error(`paper cue mismatch: timings=${timingHits}, script=${scriptHits}`)

  await db.update(reels).set({
    timings: correctedTimings,
    audioScript: correctedAudioScript,
    status: 'rendering',
    alertNote: null,
    updatedAt: new Date(),
  }).where(eq(reels.id, REEL_ID))

  console.log(`[audit] owner ${owner.id}: paper cue raised to ${PAPER_DB}dB; all other mix/visual decisions unchanged`)
  await mixAudioStep(REEL_ID)
  const after = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID), columns: { costCents: true } })
  if (after?.costCents !== reel.costCents) throw new Error(`zero-cost remix changed cost ${reel.costCents}c → ${after?.costCents}c`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'render' })
  console.log(`paper trim remixed locally and enqueued; reel cost remains ${after.costCents}c`)
  process.exit(0)
})()
