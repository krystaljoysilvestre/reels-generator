// Operator recovery for a provider-baked music fade that defeated the persisted music-focused ending.
// Reuses an already-paid stable passage, records a zero-cost derived asset, then resumes at mix_audio.
import '../src/env.js'

void (async () => {
  const REEL_ID = 'd5bec144-e3c3-4ae6-80b5-9a7c7463a0dd'
  const STABLE_START_SEC = 84
  const STABLE_END_SEC = 88
  const CROSSFADE_SEC = 2
  const { getDb, reels, channels, users, assets } = await import('@reels/db')
  const { TimingsSchema, transition } = await import('@reels/core')
  const { downloadBuffer, uploadBuffer } = await import('@reels/providers')
  const { enqueueStep } = await import('@reels/queue')
  const { eq } = await import('drizzle-orm')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { mkdtemp, readFile, rm, writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const { tmpdir } = await import('node:os')
  const exec = promisify(execFile)
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
  if (!reel?.musicKey || !reel.timings) throw new Error('reel music source or timings missing')
  if (reel.status !== 'failed') throw new Error(`expected failed reel, found ${reel.status}`)
  transition(reel.status, 'rendering')
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel?.userId) throw new Error('channel owner not found')
  const owner = await db.query.users.findFirst({ where: eq(users.id, channel.userId) })
  if (!owner || owner.status !== 'active') throw new Error('channel owner is not active')

  const timings = TimingsSchema.parse(reel.timings)
  const ending = timings.ending
  if (!ending || ending.focus !== 'music' || ending.shape !== 'resolve') {
    throw new Error(`unexpected ending direction: ${JSON.stringify(ending ?? null)}`)
  }
  if (ending.endMs !== timings.durationMs) throw new Error('ending does not terminate at reel duration')
  const durationSec = timings.durationMs / 1000
  const headEndSec = ending.startMs / 1000 + CROSSFADE_SEC / 2
  const tailDurationSec = durationSec - headEndSec + CROSSFADE_SEC
  if (STABLE_END_SEC >= headEndSec) throw new Error('stable passage overlaps the ending transition')

  const dir = await mkdtemp(join(tmpdir(), 'kendrix-titanic-music-tail-'))
  try {
    const sourcePath = join(dir, 'source.mp3')
    const repairedPath = join(dir, 'repaired.m4a')
    await writeFile(sourcePath, await downloadBuffer(reel.musicKey))
    const loopSamples = Math.round((STABLE_END_SEC - STABLE_START_SEC) * 44_100)
    const filter =
      `[0:a]atrim=0:${headEndSec.toFixed(3)},asetpts=PTS-STARTPTS[head];` +
      `[0:a]atrim=${STABLE_START_SEC}:${STABLE_END_SEC},asetpts=PTS-STARTPTS,` +
      `aloop=loop=-1:size=${loopSamples},atrim=0:${tailDurationSec.toFixed(3)}[tail];` +
      `[head][tail]acrossfade=d=${CROSSFADE_SEC.toFixed(3)}:c1=tri:c2=tri[out]`
    await exec('ffmpeg', [
      '-hide_banner', '-y', '-i', sourcePath,
      '-filter_complex', filter,
      '-map', '[out]', '-c:a', 'aac', '-b:a', '192k', repairedPath,
    ])

    const { stdout: durationOut } = await exec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', repairedPath,
    ])
    const repairedDurationSec = Number(durationOut.trim())
    if (!Number.isFinite(repairedDurationSec) || Math.abs(repairedDurationSec - durationSec) > 0.05) {
      throw new Error(`repaired music duration ${repairedDurationSec}s does not match ${durationSec}s`)
    }
    const qaDurationSec = (ending.endMs - 700 - ending.voiceEndMs) / 1000
    const { stderr: endingQa } = await exec('ffmpeg', [
      '-hide_banner', '-ss', (ending.voiceEndMs / 1000).toFixed(3), '-i', repairedPath,
      '-t', qaDurationSec.toFixed(3), '-af', 'volumedetect', '-f', 'null', '-',
    ])
    const meanMatch = endingQa.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)
    const endingMeanDb = meanMatch ? Number(meanMatch[1]) : Number.NaN
    if (!Number.isFinite(endingMeanDb) || endingMeanDb < -55) {
      throw new Error(`repaired source still inaudible in ending QA window (${endingMeanDb} dB)`)
    }

    const repairedKey = `audio/reel/${REEL_ID}-ending-hold-v1.m4a`
    await uploadBuffer(repairedKey, await readFile(repairedPath), 'audio/mp4')
    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        reelId: REEL_ID,
        channelId: reel.channelId,
        kind: 'music',
        storageKey: repairedKey,
        provider: 'local',
        costCents: 0,
        meta: {
          type: 'operator_music_tail_repair',
          derivedFrom: reel.musicKey,
          stablePassageSec: [STABLE_START_SEC, STABLE_END_SEC],
          crossfadeSec: CROSSFADE_SEC,
          endingMeanDb,
          reason: 'Provider source baked an early fade that made the persisted music-focused ending inaudible.',
        },
      }).onConflictDoUpdate({
        target: [assets.reelId, assets.storageKey],
        set: {
          provider: 'local',
          costCents: 0,
          meta: {
            type: 'operator_music_tail_repair',
            derivedFrom: reel.musicKey,
            stablePassageSec: [STABLE_START_SEC, STABLE_END_SEC],
            crossfadeSec: CROSSFADE_SEC,
            endingMeanDb,
            reason: 'Provider source baked an early fade that made the persisted music-focused ending inaudible.',
          },
          createdAt: new Date(),
        },
      })
      await tx.update(reels).set({
        musicKey: repairedKey,
        musicLengthMs: timings.durationMs,
        status: 'rendering',
        alertNote: null,
        updatedAt: new Date(),
      }).where(eq(reels.id, REEL_ID))
    })

    console.log(`[audit] owner ${owner.id} applied zero-cost music-tail repair to reel ${REEL_ID}`)
    console.log(`source=${reel.musicKey} repaired=${repairedKey} endingMean=${endingMeanDb.toFixed(1)}dB cost=0c`)
    await enqueueStep({ reelId: REEL_ID, stepName: 'mix_audio' })
    console.log('enqueued mix_audio')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  process.exit(0)
})()
