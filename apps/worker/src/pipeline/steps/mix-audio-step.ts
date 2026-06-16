import { eq } from 'drizzle-orm'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, reels, assets, channels } from '@reels/db'
import { downloadBuffer, uploadBuffer, buildInputHash } from '@reels/providers'
import { TimingsSchema, AudioScriptSchema, AudioPacksSchema } from '@reels/core'
import { mixAudio, premixSfx } from '@reels/render/ffmpeg/mix-audio'
import { writeFile, mkdir } from 'node:fs/promises'
import { runStep } from '../harness.js'

export async function mixAudioStep(reelId: string): Promise<void> {
  const db = getDb()

  const reel = await db.query.reels.findFirst({ where: eq(reels.id, reelId) })
  if (!reel?.timings || !reel.audioScript) throw new Error(`Reel missing timings or audioScript: ${reelId}`)

  const timings = TimingsSchema.parse(reel.timings)
  const audioScript = AudioScriptSchema.parse(reel.audioScript)

  const channel = await db.query.channels.findFirst({ where: eq(channels.id, reel.channelId) })
  if (!channel) throw new Error(`Channel not found`)
  const audioPacks = AudioPacksSchema.parse(channel.audioPacks)

  // Collect all assets for this reel
  const allAssets = await db.query.assets.findMany({ where: eq(assets.reelId, reelId) })
  const voiceover = allAssets.find((a) => a.kind === 'voiceover')
  const ambient = allAssets.find((a) => a.kind === 'ambient')
  const sfxAssets = allAssets.filter((a) => a.kind === 'sfx')
  if (!voiceover) throw new Error('No voiceover asset')

  const inputHash = buildInputHash('mix_audio.v1', {
    voiceover: voiceover.storageKey,
    ambient: ambient?.storageKey ?? 'none',
    sfxCount: sfxAssets.length,
    hasMusic: !!timings.music,
    reelId,
  })

  const result = await runStep(
    { reelId, stepName: 'mix_audio', inputHash },
    async () => {
      const tmp = join(tmpdir(), `reels-${reelId}`)
      await mkdir(tmp, { recursive: true })

      // Download assets to tmp dir
      const voiceoverBuf = await downloadBuffer(voiceover.storageKey)
      const voiceoverPath = join(tmp, 'voiceover.mp3')
      await writeFile(voiceoverPath, voiceoverBuf)

      // Ambient — use a silence file if none available
      let ambientPath = join(tmp, 'ambient.mp3')
      if (ambient) {
        const buf = await downloadBuffer(ambient.storageKey)
        await writeFile(ambientPath, buf)
      } else {
        // Create silence fallback
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const exec = promisify(execFile)
        await exec('ffmpeg', [
          '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono',
          '-t', String(timings.durationMs / 1000),
          '-c:a', 'aac', '-y', ambientPath,
        ])
      }

      // Pre-mix SFX
      const sfxEvents: { storageKey: string; atMs: number; volumeDb: number }[] = []
      for (const sfxAsset of sfxAssets) {
        const meta = sfxAsset.meta as { anchor?: string; durationMs?: number }
        const event = timings.sfxEvents.find((e) => e.anchor === meta.anchor)
        if (event) {
          const buf = await downloadBuffer(sfxAsset.storageKey)
          const localPath = join(tmp, `sfx_${sfxAsset.id}.mp3`)
          await writeFile(localPath, buf)
          sfxEvents.push({ storageKey: localPath, atMs: event.atMs, volumeDb: event.volumeDb })
        }
      }
      const sfxPremixPath = join(tmp, 'sfx_premix.aac')
      await premixSfx({
        sfxEvents,
        durationMs: timings.durationMs,
        outputPath: sfxPremixPath,
        tmpDir: tmp,
      })

      // Full mix
      const mixPath = join(tmp, 'mix.m4a')
      await mixAudio({
        voiceoverPath,
        ambientPath,
        sfxPremixedPath: sfxPremixPath,
        musicPack: audioPacks.musicPack,
        timings,
        outputPath: mixPath,
        musicType: audioScript.music?.type ?? null,
        musicMoodTags: audioScript.music?.moodTags ?? [],
      })

      // Upload result
      const { readFile } = await import('node:fs/promises')
      const mixBuf = await readFile(mixPath)
      const storageKey = `reels/${reelId}/mix.m4a`
      await uploadBuffer(storageKey, mixBuf, 'audio/mp4')

      // Register as asset
      await db.insert(assets).values({
        reelId,
        channelId: reel.channelId,
        kind: 'ambient',   // reusing 'ambient' kind for the final mix; could add a 'mix' kind later
        storageKey,
        provider: 'local',
        costCents: 0,
        meta: { type: 'final_mix', durationMs: timings.durationMs },
      }).onConflictDoNothing()

      return { output: { storageKey }, costCents: 0 }
    },
  )
}
