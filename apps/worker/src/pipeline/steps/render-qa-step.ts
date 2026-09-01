import { eq, and, desc } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { getDb, reels, assets, channels } from '@reels/db'
import { downloadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, channelPlatformPreset, AudioScriptSchema, AudioPacksSchema, musicIntensityToDb, type Timings } from '@reels/core'
import { runRenderQa } from '@reels/render/qa/render-qa'
import { endingTerminalFadeMs } from '@reels/render/music/music-sync'
import { runStep, setReelStatus } from '../harness.js'

// ── Bed-presence QA (Phase A, 2026-07-24) ─────────────────────────────────────────────────────────────
// A bed the design INTENDED must be measurably present — otherwise thin/absent audio ships clean (runRenderQa
// only checks LUFS/black/duration, never per-layer presence: the "QA blind spot"). Uses the persisted stems
// (voice + music), so it's free and needs no re-render. Respects intent: run only when a bed was intended
// (`music: null` — a calm register's deliberate choice — skips it). The threshold is INTENSITY-AWARE: a
// 'subtle' bed legitimately sits ~19 dB under the voice, so a flat floor would false-fail restraint. It is
// -bedDb (the true target) + a margin covering the sidechain duck + measurement slack.
const BED_PRESENCE_MARGIN_DB = 8
const STEM_SILENCE_LUFS = -60

async function measureStemLufs(reelId: string, layer: 'voice' | 'music', tmp: string): Promise<number | null | 'absent'> {
  let buf: Buffer
  try {
    buf = await downloadBuffer(`reels/${reelId}/stems/${layer}.m4a`)
  } catch {
    return 'absent'
  }
  const p = join(tmp, `stem_${layer}.m4a`)
  await writeFile(p, buf)
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const { stderr } = await exec('ffmpeg', ['-i', p, '-filter:a', 'loudnorm=print_format=json', '-f', 'null', '-'])
    const m = stderr.match(/"input_i"\s*:\s*"(-?\d+(?:\.\d+)?)"/)
    return m ? parseFloat(m[1]!) : null
  } catch {
    return null
  }
}

// Returns a failure string if an intended bed is inaudible/absent, else null. bedDb = dB the bed sits under
// the voice for this channel's intensity (see musicIntensityToDb).
async function checkBedPresence(reelId: string, bedDb: number, tmp: string): Promise<string | null> {
  const music = await measureStemLufs(reelId, 'music', tmp)
  const voice = await measureStemLufs(reelId, 'voice', tmp)
  // No stems at all (a reel mixed before stems existed) → can't judge; don't false-fail.
  if (voice === 'absent') { console.warn(`[qa] ${reelId} no voice stem — skipping bed-presence check`); return null }
  if (voice === null) return null // voice unmeasurable → can't judge
  // Music stem absent or silent while a bed was intended → the bed was lost or never resolved.
  if (music === 'absent' || music === null || music < STEM_SILENCE_LUFS) {
    return `music bed intended but inaudible (music stem silent/absent)`
  }
  const delta = voice - music
  const threshold = -bedDb + BED_PRESENCE_MARGIN_DB
  if (delta > threshold) {
    return `music bed intended but inaudible (voice−music = ${delta.toFixed(1)} dB, max ${threshold.toFixed(0)} dB for this intensity)`
  }
  console.log(`[qa] ${reelId} bed presence OK: voice−music = ${delta.toFixed(1)} dB (max ${threshold.toFixed(0)})`)
  return null
}

// Ending-window craftsmanship guard. It does not decide what the ending should be; Direction already
// chose the focused layer. QA only verifies that the selected layer actually survives the hold and that
// the mixer did not create a dead gap before its short terminal fade.
async function checkEndingPresence(reelId: string, timings: Timings, tmp: string): Promise<string | null> {
  const ending = timings.ending
  if (!ending || ending.focus === 'silence') return null
  const layer = ending.focus === 'music' ? 'music' : 'ambient'
  let buf: Buffer
  try {
    buf = await downloadBuffer(`reels/${reelId}/stems/${layer}.m4a`)
  } catch {
    return `ending focus is ${layer}, but its stem is absent`
  }
  const path = join(tmp, `ending_${layer}.m4a`)
  await writeFile(path, buf)
  const startSec = ending.voiceEndMs / 1000
  const endSec = (ending.endMs - endingTerminalFadeMs(ending.shape)) / 1000
  const durationSec = endSec - startSec
  if (durationSec <= 0.1) return null
  try {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const exec = promisify(execFile)
    const { stderr } = await exec('ffmpeg', [
      '-ss', startSec.toFixed(3), '-i', path, '-t', durationSec.toFixed(3),
      '-af', 'volumedetect', '-f', 'null', '-',
    ])
    const mean = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)
    if (!mean?.[1] || parseFloat(mean[1]) < -55) {
      return `ending focus ${layer} is inaudible before the terminal fade`
    }
    console.log(`[qa] ${reelId} ending ${layer} present: ${mean[1]} dB mean before terminal fade`)
    return null
  } catch {
    return `ending focus ${layer} could not be measured`
  }
}

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
  const platformPreset = channelPlatformPreset(channel ?? {})
  const maxDurationMs = Math.max(180_000, Math.round(platformPreset.maxSeconds * 1000 * 1.1))
  // Bed-presence inputs: did the design intend a bed, and at what intensity does this channel place it?
  const audioScript = reel.audioScript ? AudioScriptSchema.parse(reel.audioScript) : null
  const musicIntended = audioScript?.music != null
  const musicIntensity = channel ? AudioPacksSchema.parse(channel.audioPacks).musicIntensity : 'balanced'
  // The render key is constant per reel, so hashing renderUrl alone let QA SKIP a re-render (validating a
  // stale cut). Hash the render asset's createdAt too — it's bumped on every render → QA re-runs each time.
  const renderAsset = await db.query.assets.findFirst({
    where: and(eq(assets.reelId, reelId), eq(assets.kind, 'render')),
    orderBy: [desc(assets.createdAt)],
  })
  const inputHash = buildInputHash('render_qa.v4', {
    renderUrl: reel.renderUrl,
    reelId,
    renderAt: renderAsset?.createdAt ?? null,
  })

  const result = await runStep(
    { reelId, stepName: 'render_qa', inputHash, spendsProviderMoney: false },
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

      // Bed-presence invariant: an intended bed must be audible. Runs off the persisted stems (free); skips
      // when `music: null` (respects a calm register's intent). Reported alongside runRenderQa's failures.
      const bedFailures: string[] = []
      if (musicIntended) {
        const { bedDb } = musicIntensityToDb(musicIntensity)
        const bedFail = await checkBedPresence(reelId, bedDb, tmp)
        if (bedFail) bedFailures.push(bedFail)
      }
      const endingFailure = await checkEndingPresence(reelId, timings, tmp)
      if (endingFailure) bedFailures.push(endingFailure)

      const allFailures = [...qa.failures, ...bedFailures]
      if (allFailures.length > 0) {
        // Route to fix queue — never to publish. Log failures as the step error.
        throw new Error(`render_qa failed:\n${allFailures.join('\n')}`)
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
