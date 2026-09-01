// Founder playback correction: remove decorative/voice-masking SFX, keep three evidence-serving cues at
// restrained levels with voice ducking, and explicitly opt this reel out of automatic red word accents.
// Reuses every existing paid asset; the remix and render tail are local/zero-cost.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const KEEP = new Map([
    ['acting Second Officer Blair had supplied lookouts with binoculars', { volumeDb: -16, fadeInMs: 20, fadeOutMs: 120 }],
    ["struck the crow's-nest bell three times", { volumeDb: -14, fadeInMs: 20, fadeOutMs: 180 }],
    ['the Marconi room received a Mesaba message', { volumeDb: -22, fadeInMs: 120, fadeOutMs: 250 }],
  ])

  const { getDb, reels, channels, users, assets, visualTruthBlockers } = await import('@reels/db')
  const { AudioScriptSchema, TimingsSchema, transition } = await import('@reels/core')
  const { enqueueStep } = await import('@reels/queue')
  const { mixAudioStep } = await import('../src/pipeline/steps/mix-audio-step.js')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel?.timings || !reel.audioScript) throw new Error('reel playback data missing')
  transition(reel.status, 'rendering')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')
  const blockers = await visualTruthBlockers(REEL_ID)
  if (blockers.length > 0) throw new Error(`visual truth blockers: ${JSON.stringify(blockers)}`)

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)
  const correctedTimings = TimingsSchema.parse({
    ...timings,
    subtitles: timings.subtitles.map((chunk) => ({
      ...chunk,
      words: chunk.words.map((word) => ({ ...word, emphasis: false })),
    })),
    sfxEvents: timings.sfxEvents.flatMap((event) => {
      const correction = KEEP.get(event.anchor)
      return correction ? [{ ...event, ...correction }] : []
    }),
    sfxDuck: { threshold: 0.04, ratio: 2, attackMs: 15, releaseMs: 160 },
  })
  const correctedAudioScript = AudioScriptSchema.parse({
    ...audioScript,
    sfx: audioScript.sfx.flatMap((cue) => {
      const correction = KEEP.get(cue.anchor)
      return correction ? [{ ...cue, volumeDb: correction.volumeDb }] : []
    }),
  })
  if (correctedTimings.sfxEvents.length !== KEEP.size || correctedAudioScript.sfx.length !== KEEP.size) {
    throw new Error('retained cue set did not resolve exactly')
  }

  const allSfx = await db.query.assets.findMany({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.kind, 'sfx')),
  })
  const foley = allSfx.filter((asset) => (asset.meta as Record<string, unknown>)['foley'] === true)

  await db.transaction(async (tx) => {
    for (const asset of foley) {
      await tx.update(assets).set({
        meta: {
          ...(asset.meta as Record<string, unknown>),
          foley: false,
          disabled: true,
          disabledReason: 'founder mix review: decorative cue masked evidence-led narration',
        },
      }).where(eq(assets.id, asset.id))
    }
    await tx.update(reels).set({
      audioScript: correctedAudioScript,
      timings: correctedTimings,
      status: 'rendering',
      alertNote: null,
      updatedAt: new Date(),
    }).where(eq(reels.id, REEL_ID))
  })

  console.log(`[audit] owner ${owner.id}: disabled ${foley.length} decorative foley asset(s); retained 3 source cues; captions explicitly monochrome`)
  await mixAudioStep(REEL_ID)
  const after = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID), columns: { costCents: true } })
  if (after?.costCents !== reel.costCents) throw new Error(`zero-cost remix changed cost ${reel.costCents}c → ${after?.costCents}c`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'render' })
  console.log(`remixed locally and enqueued render; reel cost remains ${after.costCents}c`)
  process.exit(0)
})()
