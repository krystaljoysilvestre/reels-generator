import { eq } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { getDb, reels, assets } from '@reels/db'
import { downloadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema } from '@reels/core'
import { runRenderQa } from '@reels/render/qa/render-qa'
import { runStep, setReelStatus } from '../harness.js'

export async function renderQaStep(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.timings || !reel.renderUrl) throw new Error(`Reel missing timings or renderUrl: ${reelId}`)

  const timings = TimingsSchema.parse(reel.timings)
  const inputHash = buildInputHash('render_qa.v1', { renderUrl: reel.renderUrl, reelId })

  const result = await runStep(
    { reelId, stepName: 'render_qa', inputHash },
    async () => {
      const tmp = join(tmpdir(), `reels-qa-${reelId}`)
      await mkdir(tmp, { recursive: true })
      try {

      const renderBuf = await downloadBuffer(reel.renderUrl!)
      const localPath = join(tmp, 'render.mp4')
      await writeFile(localPath, renderBuf)

      const qa = await runRenderQa({
        renderPath: localPath,
        durationMs: timings.durationMs,
        subtitleCount: timings.subtitles.length,
        sfxAnchorCount: timings.sfxEvents.length,
      })

      if (!qa.passed) {
        // Route to fix queue — never to publish. Log failures as the step error.
        throw new Error(`render_qa failed:\n${qa.failures.join('\n')}`)
      }

      return {
        output: {
          passed: true,
          lufs: qa.measuredLufs,
          durationMs: qa.measuredDurationMs,
          warnings: qa.warnings,
        },
        costCents: 0,
      }
      } finally {
        // Reclaim the QA scratch dir on pass, fail, or throw.
        await rm(tmp, { recursive: true, force: true })
      }
    },
  )

  // QA passed → advance to spot_check
  await setReelStatus(reelId, 'spot_check')
}
