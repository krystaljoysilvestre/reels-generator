// mix_audio FFmpeg recipe — docs/07 §3
// Layer order: voiceover (master) → ambient → music (looped+enveloped+ducked) → SFX → loudnorm
// Music is mixed BEFORE SFX so stings sit cleanly on top. The music track is a LOCAL file the
// caller already downloaded (track.path) — beds are flat/loopable, so we loop (not stretch) it.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rename } from 'node:fs/promises'
import type { MusicTrack } from '@reels/core'
import type { Timings } from '@reels/core'
import { buildGainExpr, buildTwoSectionGains } from '../music/music-sync.js'
import { selectMusicTrack } from '../music/music-selection.js'

const execFileAsync = promisify(execFile)

export interface MixAudioParams {
  voiceoverPath: string
  ambientPath: string
  sfxPremixedPath: string     // all SFX already placed at word timestamps in a pre-step
  musicPack: MusicTrack[]
  timings: Timings
  outputPath: string
  // From audio_script music cue:
  musicType: 'low_drone' | 'drone_swell' | 'riser_sting' | null
  musicMoodTags: string[]
  bedDb?: number              // default -22
  peakDb?: number             // default -12
  // Two-section AI scoring: when BOTH are set, the intro bed crossfades into the climax bed at the twist
  // (bypasses musicPack selection). Local file paths the caller already downloaded.
  musicBedAPath?: string | undefined
  musicBedBPath?: string | undefined
}

const DEFAULT_BED_DB = -22
const DEFAULT_PEAK_DB = -12

// Final loudness normalization → render_qa requires -14 ±0.5 LUFS. ffmpeg's loudnorm (single- OR
// two-pass) undershoots on speech-crest content: to honor the -1.5 dBTP ceiling it backs off the
// gain and lands ~1–2 LU quiet. Instead we gain the premaster straight to target and let a limiter
// hold the peaks; the limiter shaves a little loudness, so we measure and apply one corrective gain.
const TARGET_LUFS = -14
const TRUE_PEAK = -1.5

function parseIntegrated(stderr: string): number | null {
  const m = stderr.match(/"input_i"\s*:\s*"(-?\d+(?:\.\d+)?)"/)
  return m ? parseFloat(m[1]!) : null
}

// Integrated loudness the filtergraph's [premaster] would produce (analysis run, no output written).
async function measurePremaster(inputs: string[], pre: string[], durationSec: number): Promise<number | null> {
  const fg = [...pre, `[premaster]loudnorm=print_format=json[out]`].join(';')
  try {
    const { stderr } = await execFileAsync('ffmpeg', [
      ...inputs, '-filter_complex', fg, '-map', '[out]', '-t', String(durationSec), '-f', 'null', '-',
    ])
    return parseIntegrated(stderr)
  } catch {
    return null
  }
}

// Integrated loudness of an already-encoded audio file.
async function measureFile(path: string): Promise<number | null> {
  try {
    const { stderr } = await execFileAsync('ffmpeg', [
      '-i', path, '-filter:a', 'loudnorm=print_format=json', '-f', 'null', '-',
    ])
    return parseIntegrated(stderr)
  } catch {
    return null
  }
}

// Encode the mix normalized to TARGET_LUFS (gain-to-target + limiter, then one corrective gain pass).
async function encodeWithLoudnorm(inputs: string[], pre: string[], durationSec: number, outputPath: string): Promise<void> {
  const i0 = await measurePremaster(inputs, pre, durationSec)
  const tail =
    i0 == null
      ? `[premaster]loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK}:LRA=11[out]` // fallback: single-pass loudnorm
      : `[premaster]volume=${(TARGET_LUFS - i0).toFixed(2)}dB,alimiter=limit=${TRUE_PEAK}dB:level=false[out]`
  await execFileAsync('ffmpeg', [
    ...inputs,
    '-filter_complex', [...pre, tail].join(';'),
    '-map', '[out]',
    '-t', String(durationSec), // bound output (music/ambient loop forever)
    '-c:a', 'aac',
    '-b:a', '192k',
    '-y',
    outputPath,
  ])
  if (i0 == null) return
  // The limiter shaves a little integrated loudness — measure the result and correct in one pass.
  const i1 = await measureFile(outputPath)
  if (i1 != null && Math.abs(TARGET_LUFS - i1) > 0.25) {
    const corrected = `${outputPath}.norm.m4a`
    await execFileAsync('ffmpeg', [
      '-i', outputPath, '-af', `volume=${(TARGET_LUFS - i1).toFixed(2)}dB`,
      '-c:a', 'aac', '-b:a', '192k', '-y', corrected,
    ])
    await rename(corrected, outputPath)
  }
}

export async function mixAudio(params: MixAudioParams): Promise<void> {
  // Two-section AI scoring: intro bed → climax bed, crossfaded at the twist.
  if (params.musicBedAPath && params.musicBedBPath && params.timings.music) {
    await mixTwoSection(params, params.musicBedAPath, params.musicBedBPath)
    return
  }

  // No music path — skip entirely (silence + ambience is valid). docs/07 §6 rule 1
  if (!params.musicType || !params.timings.music) {
    await mixNoMusic(params)
    return
  }

  const track = selectMusicTrack({
    musicPack: params.musicPack,
    musicType: params.musicType,
    moodTags: params.musicMoodTags,
  })

  if (!track) {
    await mixNoMusic(params)
    return
  }

  const bedDb = params.bedDb ?? DEFAULT_BED_DB
  const peakDb = params.peakDb ?? DEFAULT_PEAK_DB
  const { startAnchorMs, peakAnchorMs } = params.timings.music

  // §2 Volume envelope. The bed is LOOPED to cover the reel (not time-stretched) — beds are flat
  // and loopable, and this envelope (bed dB → peak dB) creates the swell toward the climax.
  const gainParams: Parameters<typeof buildGainExpr>[0] = {
    startAnchorMs,
    peakAnchorMs,
    bedDb,
    peakDb,
    durationMs: params.timings.durationMs,
  }
  if (params.timings.silenceDrop) {
    gainParams.silenceDropMs = params.timings.silenceDrop
  }
  const gainExpr = buildGainExpr(gainParams)

  // §3 Full filtergraph — everything up to [premaster]; the loudnorm tail is added by encodeWithLoudnorm.
  const inputs = [
    '-i', params.voiceoverPath,
    '-i', params.ambientPath,
    '-i', track.path,
    '-i', params.sfxPremixedPath,
  ]
  const pre = [
    // ambient: volume-reduce + loop to cover full duration
    `[1]volume=${bedDb}dB,aloop=loop=-1:size=2e9[amb]`,
    // music: loop the bed to cover the reel → volume envelope
    `[2]aloop=loop=-1:size=2e9,volume='${gainExpr}':eval=frame[mus0]`,
    // sidechain duck: music ducks ~6-10 dB whenever voiceover speaks
    `[0]asplit=2[vox][voxkey]`,
    `[mus0][voxkey]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[musduck]`,
    // mix layers
    `[vox][amb]amix=inputs=2:normalize=0[base]`,
    `[base][musduck]amix=inputs=2:normalize=0[withmus]`,
    `[withmus][3]amix=inputs=2:normalize=0[premaster]`,
  ]
  await encodeWithLoudnorm(inputs, pre, params.timings.durationMs / 1000, params.outputPath)
}

// Two-section mix: intro bed (input 2) crossfades into climax bed (input 3) at the twist; both loop to
// cover the reel, both duck under the voiceover. Layer order matches mixAudio: vox → ambient → music → SFX.
async function mixTwoSection(params: MixAudioParams, bedAPath: string, bedBPath: string): Promise<void> {
  const bedDb = params.bedDb ?? DEFAULT_BED_DB
  const peakDb = params.peakDb ?? DEFAULT_PEAK_DB
  const { startAnchorMs, peakAnchorMs } = params.timings.music!

  const gp: Parameters<typeof buildTwoSectionGains>[0] = {
    startAnchorMs,
    peakAnchorMs,
    bedDb,
    peakDb,
    durationMs: params.timings.durationMs,
  }
  if (params.timings.silenceDrop) gp.silenceDropMs = params.timings.silenceDrop
  const { intro, climax } = buildTwoSectionGains(gp)

  const inputs = [
    '-i', params.voiceoverPath,   // 0
    '-i', params.ambientPath,     // 1
    '-i', bedAPath,               // 2 — intro
    '-i', bedBPath,               // 3 — climax
    '-i', params.sfxPremixedPath, // 4
  ]
  const pre = [
    `[1]volume=${bedDb}dB,aloop=loop=-1:size=2e9[amb]`,
    // intro + climax beds: loop, apply crossfade envelopes, sum into one music stream
    `[2]aloop=loop=-1:size=2e9,volume='${intro}':eval=frame[musA]`,
    `[3]aloop=loop=-1:size=2e9,volume='${climax}':eval=frame[musB]`,
    `[musA][musB]amix=inputs=2:normalize=0[musfull]`,
    // sidechain duck the music under the voiceover
    `[0]asplit=2[vox][voxkey]`,
    `[musfull][voxkey]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[musduck]`,
    // mix layers
    `[vox][amb]amix=inputs=2:normalize=0[base]`,
    `[base][musduck]amix=inputs=2:normalize=0[withmus]`,
    `[withmus][4]amix=inputs=2:normalize=0[premaster]`,
  ]
  await encodeWithLoudnorm(inputs, pre, params.timings.durationMs / 1000, params.outputPath)
}

async function mixNoMusic(params: MixAudioParams): Promise<void> {
  // 3-track mix: voiceover + ambient + SFX, no music layer
  const inputs = [
    '-i', params.voiceoverPath,
    '-i', params.ambientPath,
    '-i', params.sfxPremixedPath,
  ]
  const pre = [
    `[1]volume=-20dB,aloop=loop=-1:size=2e9[amb]`,
    `[0][amb]amix=inputs=2:normalize=0[base]`,
    `[base][2]amix=inputs=2:normalize=0[premaster]`,
  ]
  await encodeWithLoudnorm(inputs, pre, params.timings.durationMs / 1000, params.outputPath)
}

// SFX pre-mix: place each SFX file at its timestamp into a silent base track
export async function premixSfx(params: {
  sfxEvents: Array<{ storageKey: string; atMs: number; volumeDb: number }>
  durationMs: number
  outputPath: string
  tmpDir: string
}): Promise<void> {
  if (params.sfxEvents.length === 0) {
    // Generate silence file of the right duration
    await execFileAsync('ffmpeg', [
      '-f', 'lavfi', '-i', `anullsrc=r=44100:cl=mono`,
      '-t', String(params.durationMs / 1000),
      '-c:a', 'aac', '-y', params.outputPath,
    ])
    return
  }

  // Build a filter that delays each SFX to its timestamp and sums them
  const inputs: string[] = []
  const delayFilters: string[] = []
  const mixInputs: string[] = []

  params.sfxEvents.forEach((ev, i) => {
    inputs.push('-i', ev.storageKey)
    delayFilters.push(`[${i}]volume=${ev.volumeDb}dB,adelay=${ev.atMs}|${ev.atMs}[sfx${i}]`)
    mixInputs.push(`[sfx${i}]`)
  })

  const filtergraph = [
    ...delayFilters,
    `${mixInputs.join('')}amix=inputs=${params.sfxEvents.length}:normalize=0[sfxout]`,
  ].join(';')

  await execFileAsync('ffmpeg', [
    ...inputs,
    '-filter_complex', filtergraph,
    '-map', '[sfxout]',
    '-t', String(params.durationMs / 1000),
    '-c:a', 'aac', '-y', params.outputPath,
  ])
}

