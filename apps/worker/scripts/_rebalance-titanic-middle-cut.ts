// Founder mix/caption pass 2: restore designed SFX presence at a controlled middle level, keep only
// evidence-bearing red caption words, and remove the competing top-of-frame chapter labels.
// Reuses the seven already-paid SFX sources; no provider calls.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const cues: Array<{
    anchor: string
    prompt: string
    atMs: number
    volumeDb: number
    impactAtEnd: boolean
    targetDurationSec: number
    fadeOutMs?: number
  }> = [
    { anchor: 'When Titanic left Southampton', prompt: "ship's horn and distant seagulls", atMs: 100, volumeDb: -17, impactAtEnd: false, targetDurationSec: 3 },
    { anchor: 'acting Second Officer Blair had supplied lookouts with binoculars', prompt: 'binocular case snap shut', atMs: 16185, volumeDb: -10, impactAtEnd: false, targetDurationSec: 1.5 },
    { anchor: 'lookout Frederick Fleet spotted the iceberg with unaided eyes', prompt: 'sudden intake of breath', atMs: 31428, volumeDb: -16, impactAtEnd: false, targetDurationSec: 1.5 },
    { anchor: "struck the crow's-nest bell three times", prompt: 'sharp bell strikes, three times', atMs: 35968, volumeDb: -6, impactAtEnd: true, targetDurationSec: 4 },
    { anchor: "Fleet spotted the iceberg with unaided eyes, struck the crow's-nest bell three times", prompt: "distant shout: 'Iceberg right ahead'", atMs: 32357, volumeDb: -18, impactAtEnd: false, targetDurationSec: 2 },
    { anchor: 'the Marconi room received a Mesaba message', prompt: 'morse code tapping', atMs: 54718, volumeDb: -14, impactAtEnd: false, targetDurationSec: 4, fadeOutMs: 120 },
    { anchor: 'Two hours before Fleet rang that bell', prompt: 'rustling paper and quiet room tone', atMs: 52404, volumeDb: -20, impactAtEnd: false, targetDurationSec: 5, fadeOutMs: 120 },
  ]
  const redMarks = new Set([
    'record does not establish the popular claim\u0000not',
    'and it never reached Captain Smith or\u0000never',
    'The inquiry found the Mesaba message might\u0000might',
    'by the excessive speed at which she\u0000excessive',
    'the Mesaba warning that never left the\u0000never',
    'and 22 knots in known proximity to\u000022',
  ])

  const { getDb, reels, scenes, channels, users, assets, visualTruthBlockers } = await import('@reels/db')
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

  const sourceAssets = await db.query.assets.findMany({
    where: and(eq(assets.reelId, REEL_ID), eq(assets.kind, 'sfx')),
  })
  const availableAnchors = new Set(sourceAssets.map((asset) => (asset.meta as Record<string, unknown>)['anchor']).filter(Boolean))
  const missing = cues.filter((cue) => !availableAnchors.has(cue.anchor))
  if (missing.length) throw new Error(`paid SFX source(s) missing: ${missing.map((cue) => cue.anchor).join(' | ')}`)

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)
  let marked = 0
  const correctedTimings = TimingsSchema.parse({
    ...timings,
    subtitles: timings.subtitles.map((chunk) => ({
      ...chunk,
      words: chunk.words.map((word) => {
        const emphasis = redMarks.has(`${chunk.text}\u0000${word.text.replace(/[^\p{L}\p{N}]/gu, '')}`)
        if (emphasis) marked++
        return { ...word, emphasis }
      }),
    })),
    sfxEvents: cues.map(({ anchor, prompt, atMs, volumeDb, fadeOutMs }) => ({
      anchor, prompt, atMs, volumeDb, ...(fadeOutMs != null ? { fadeOutMs } : {}),
    })),
    sfxDuck: { threshold: 0.04, ratio: 2, attackMs: 15, releaseMs: 160 },
  })
  if (marked !== redMarks.size) throw new Error(`semantic red mark mismatch: expected ${redMarks.size}, got ${marked}`)
  const correctedAudioScript = AudioScriptSchema.parse({
    ...audioScript,
    sfx: cues.map(({ anchor, prompt, volumeDb, impactAtEnd, targetDurationSec }) => ({
      anchor,
      offsetMs: anchor === 'When Titanic left Southampton' || anchor === 'Two hours before Fleet rang that bell' ? 100 : 0,
      prompt,
      volumeDb,
      impactAtEnd,
      targetDurationSec,
    })),
  })

  await db.transaction(async (tx) => {
    await tx.update(scenes).set({ onScreenText: null }).where(eq(scenes.reelId, REEL_ID))
    await tx.update(reels).set({
      audioScript: correctedAudioScript,
      timings: correctedTimings,
      status: 'rendering',
      alertNote: null,
      updatedAt: new Date(),
    }).where(eq(reels.id, REEL_ID))
  })

  console.log(`[audit] owner ${owner.id}: restored 7 restrained source cues, marked ${marked} semantic red words, removed all top labels`)
  await mixAudioStep(REEL_ID)
  const after = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID), columns: { costCents: true } })
  if (after?.costCents !== reel.costCents) throw new Error(`zero-cost remix changed cost ${reel.costCents}c → ${after?.costCents}c`)
  await enqueueStep({ reelId: REEL_ID, stepName: 'render' })
  console.log(`middle cut remixed locally and enqueued; reel cost remains ${after.costCents}c`)
  process.exit(0)
})()
