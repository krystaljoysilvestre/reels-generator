// Recover a render whose graded visual uploaded but whose BullMQ lock/storage connection failed before
// the final mux could be committed. Reuses the exact cached visual + approved final mix; no regeneration.
import '../src/env.js'

import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { pipeline } from 'node:stream/promises'

const execFileAsync = promisify(execFile)

void (async () => {
  const REEL_ID = '91ebdcf9-04ab-4cf2-ad8f-d9ac105a6af7'
  const VISUAL_KEY = `reels/${REEL_ID}/visual.mp4`
  const MIX_KEY = `reels/${REEL_ID}/mix.m4a`
  const RENDER_KEY = `reels/${REEL_ID}/render.mp4`
  const work = join(tmpdir(), `tylenol-render-salvage-${REEL_ID}`)

  const { getDb, reels, assets, pipelineSteps } = await import('@reels/db')
  const { TimingsSchema, transition } = await import('@reels/core')
  const { downloadStream, uploadFile } = await import('@reels/providers')
  const { enqueueStep } = await import('@reels/queue')
  const { and, eq } = await import('drizzle-orm')
  const db = getDb()

  await mkdir(work, { recursive: true })
  try {
    const reel = await db.query.reels.findFirst({ where: eq(reels.id, REEL_ID) })
    if (!reel?.timings) throw new Error('reel/timings not found')
    if (reel.status !== 'failed' && reel.status !== 'rendering' && reel.status !== 'render_qa') {
      throw new Error(`expected failed/rendering/render_qa reel, got ${reel.status}`)
    }
    const timings = TimingsSchema.parse(reel.timings)

    const visualPath = join(work, 'visual.mp4')
    const mixPath = join(work, 'mix.m4a')
    const renderPath = join(work, 'render.mp4')
    const visual = await downloadStream(VISUAL_KEY)
    await pipeline(visual.body, createWriteStream(visualPath))
    const mix = await downloadStream(MIX_KEY)
    await pipeline(mix.body, createWriteStream(mixPath))
    console.log('[salvage] cached visual and final mix downloaded')

    await execFileAsync('ffmpeg', [
      '-v', 'error',
      '-i', visualPath,
      '-i', mixPath,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-shortest',
      '-movflags', '+faststart',
      '-y', renderPath,
    ])

    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_type',
      '-of', 'json',
      renderPath,
    ])
    const probe = JSON.parse(stdout) as {
      format?: { duration?: string }
      streams?: Array<{ codec_type?: string }>
    }
    const durationMs = Math.round(Number(probe.format?.duration ?? 0) * 1000)
    const streamTypes = new Set((probe.streams ?? []).map((stream) => stream.codec_type))
    if (!streamTypes.has('video') || !streamTypes.has('audio')) {
      throw new Error(`salvaged render missing stream(s): ${JSON.stringify([...streamTypes])}`)
    }
    if (Math.abs(durationMs - timings.durationMs) > 500) {
      throw new Error(`duration mismatch: render=${durationMs}ms timings=${timings.durationMs}ms`)
    }
    console.log(`[salvage] mux validated: ${durationMs}ms, video+audio`)

    await uploadFile(RENDER_KEY, renderPath, 'video/mp4')
    const stored = await downloadStream(RENDER_KEY, 'bytes=0-1')
    stored.body.destroy()
    if (stored.statusCode !== 206 || !stored.contentRange) {
      throw new Error('uploaded render did not pass ranged-read verification')
    }
    console.log(`[salvage] final render uploaded and ranged-read verified (${stored.contentRange})`)

    await db.transaction(async (tx) => {
      await tx.insert(assets).values({
        reelId: REEL_ID,
        channelId: reel.channelId,
        kind: 'render',
        storageKey: RENDER_KEY,
        provider: 'local',
        costCents: 0,
        meta: {
          durationMs: timings.durationMs,
          renderer: 'remotion@4',
          recoveredFromCachedVisual: true,
        },
      }).onConflictDoUpdate({
        target: [assets.reelId, assets.storageKey],
        set: {
          meta: {
            durationMs: timings.durationMs,
            renderer: 'remotion@4',
            recoveredFromCachedVisual: true,
          },
          createdAt: new Date(),
        },
      })
      await tx
        .update(pipelineSteps)
        .set({
          status: 'done',
          error: null,
          output: { storageKey: RENDER_KEY, recoveredFromCachedVisual: true },
          finishedAt: new Date(),
        })
        .where(and(eq(pipelineSteps.reelId, REEL_ID), eq(pipelineSteps.stepName, 'render')))

      if (reel.status === 'failed') {
        transition('failed', 'rendering')
        transition('rendering', 'render_qa')
      } else if (reel.status === 'rendering') {
        transition('rendering', 'render_qa')
      }
      await tx
        .update(reels)
        .set({ renderUrl: RENDER_KEY, status: 'render_qa', updatedAt: new Date() })
        .where(eq(reels.id, REEL_ID))
    })

    await enqueueStep({ reelId: REEL_ID, stepName: 'render_qa' })
    console.log('[salvage] render ledger/state restored; enqueued render_qa')
  } finally {
    await rm(work, { recursive: true, force: true })
  }
  process.exit(0)
})()
