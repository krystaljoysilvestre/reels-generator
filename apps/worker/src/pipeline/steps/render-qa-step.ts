import { eq, and, desc } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { getDb, reels, assets, channels } from '@reels/db'
import { downloadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, PLATFORM_PRESETS } from '@reels/core'
import { runRenderQa } from '@reels/render/qa/render-qa'
import { runStep, setReelStatus } from '../harness.js'

export async function renderQaStep(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.timings || !reel.renderUrl) throw new Error(`Reel missing timings or renderUrl: ${reelId}`)

  const timings = TimingsSchema.parse(reel.timings)
  // Length ceiling = the channel's platform cap + 10% headroom (compute_timings may extend a reel
  // slightly for the climax ring-out), floored at the legacy 180s so this only ever RAISES the ceiling
  // for long-form — never tightens it for short-form. Stories routinely overrun their target (a 60s
  // channel can produce ~134s of narration; see breakdown-scenes), and those used to pass at <180s;
  // keying the gate straight to the 60s cap would newly hard-fail them. Long-form (600s) → 660s.
  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  const platformPreset = PLATFORM_PRESETS[(channel?.targetPlatform ?? 'all') as keyof typeof PLATFORM_PRESETS] ?? PLATFORM_PRESETS.all
  const maxDurationMs = Math.max(180_000, Math.round(platformPreset.maxSeconds * 1000 * 1.1))
  // The render key is constant per reel, so hashing renderUrl alone let QA SKIP a re-render (validating a
  // stale cut). Hash the render asset's createdAt too — it's bumped on every render → QA re-runs each time.
  const renderAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'render')),
    orderBy: [desc(assets.createdAt)],
  })
  const inputHash = buildInputHash('render_qa.v2', {
    renderUrl: reel.renderUrl,
    reelId,
    renderAt: renderAsset?.createdAt ?? null,
  })

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
        maxDurationMs,
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
