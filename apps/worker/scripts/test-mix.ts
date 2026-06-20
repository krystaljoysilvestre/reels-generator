import { readFileSync, writeFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

// Throwaway: verify that a channel's selected music bed actually mixes UNDER the voiceover.
// Runs the real mixAudio on a real TTS voiceover + a downloaded preset bed → uploads the mix.
const exec = promisify(execFile)
const REPO = '/Users/krystaljoysilvestre/Workspace/app-ideas/reels-generator'
const NARRATION = "Last night I heard footsteps on the roof. I told myself it was just the wind. But the wind doesn't stop to listen."
const BED_KEY = 'audio/presets/horror-dread.mp3'
const OUT_KEY = 'test/mix-with-music.m4a'

void (async () => {
  for (const line of readFileSync(`${REPO}/.env.local`, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m) continue
    let v = m[2]; if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[m[1]] === undefined) process.env[m[1]] = v
  }
  const { ElevenLabsTtsProvider, listVoices, downloadBuffer, uploadBuffer } = await import('@reels/providers')
  const { mixAudio, premixSfx } = await import('@reels/render/ffmpeg/mix-audio')

  const tmp = join(tmpdir(), 'reels-testmix'); await mkdir(tmp, { recursive: true })

  // 1) Voiceover via real TTS (first available English voice)
  const voices = await listVoices('english')
  const voiceId = voices[0]!.id
  console.log(`TTS with voice ${voices[0]!.name} (${voiceId})…`)
  const tts = await new ElevenLabsTtsProvider().synthesize({ narration: NARRATION, voiceId, reelId: 'testmix' })
  const voiceoverPath = join(tmp, 'voiceover.mp3')
  await writeFile(voiceoverPath, await downloadBuffer(tts.audioStorageKey))
  const durationMs = tts.durationMs
  console.log(`voiceover ${durationMs}ms`)

  // 2) Music bed (downloaded locally, as the worker now does)
  const bedLocal = join(tmp, 'bed.mp3')
  await writeFile(bedLocal, await downloadBuffer(BED_KEY))

  // 3) Ambient = silence; SFX = empty premix
  const ambientPath = join(tmp, 'ambient.mp3')
  await exec('ffmpeg', ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(durationMs / 1000), '-c:a', 'libmp3lame', '-y', ambientPath])
  const sfxPath = join(tmp, 'sfx.aac')
  await premixSfx({ sfxEvents: [], durationMs, outputPath: sfxPath, tmpDir: tmp })

  // 4) Minimal timings: music swells toward ~80% of the reel
  const timings = { durationMs, music: { type: 'low_drone', startAnchorMs: 0, peakAnchorMs: Math.round(durationMs * 0.8) }, silenceDrop: null, sfxEvents: [] }

  // 5) Mix (1-bed local pack, exactly what the worker passes)
  const mixPath = join(tmp, 'mix.m4a')
  await mixAudio({
    voiceoverPath, ambientPath, sfxPremixedPath: sfxPath,
    musicPack: [{ id: 'horror-dread', path: bedLocal, type: 'low_drone', peakFrac: 0, moodTags: ['dread'] }],
    timings: timings as never,
    outputPath: mixPath,
    musicType: 'low_drone', musicMoodTags: ['dread'],
    bedDb: -22, peakDb: -12,
  })

  // 6) Probe + upload
  const { stdout } = await exec('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', mixPath])
  console.log('mix duration:', JSON.parse(stdout).format.duration, 's')
  await uploadBuffer(OUT_KEY, readFileSync(mixPath), 'audio/mp4')
  console.log(`uploaded → ${OUT_KEY}`)
})()
