// mix_audio FFmpeg recipe — docs/07 §3
// Layer order: voiceover (master) → ambient → music (stretched+enveloped+ducked) → SFX → loudnorm
// Music is mixed BEFORE SFX so stings sit cleanly on top.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import type { MusicTrack } from '@reels/core'
import type { Timings } from '@reels/core'
import { tempoFactor, atempoChain, buildGainExpr } from '../music/music-sync.js'
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
}

const DEFAULT_BED_DB = -22
const DEFAULT_PEAK_DB = -12

export async function mixAudio(params: MixAudioParams): Promise<void> {
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

  // §2.1 Time-stretch factor
  const factor = tempoFactor(
    await getAudioDurationMs(track.path),
    track.peakFrac,
    peakAnchorMs,
  )
  const tempoChain = atempoChain(factor)
  const tempoFilter = tempoChain.join(',')

  // §2.2 Volume envelope
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

  // §3 Full filtergraph
  const filtergraph = [
    // ambient: volume-reduce + loop to cover full duration
    `[1]volume=${bedDb}dB,aloop=loop=-1:size=2e9[amb]`,
    // music: time-stretch → volume envelope
    `[2]${tempoFilter},volume='${gainExpr}':eval=frame[mus0]`,
    // sidechain duck: music ducks ~6-10 dB whenever voiceover speaks
    `[0]asplit=2[vox][voxkey]`,
    `[mus0][voxkey]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=400[musduck]`,
    // mix layers
    `[vox][amb]amix=inputs=2:normalize=0[base]`,
    `[base][musduck]amix=inputs=2:normalize=0[withmus]`,
    `[withmus][3]amix=inputs=2:normalize=0[premaster]`,
    // loudnorm to -14 LUFS (final stage — per-track dBs are relative)
    `[premaster]loudnorm=I=-14:TP=-1.5:LRA=11[out]`,
  ].join(';')

  await execFileAsync('ffmpeg', [
    '-i', params.voiceoverPath,
    '-i', params.ambientPath,
    '-i', track.path,
    '-i', params.sfxPremixedPath,
    '-filter_complex', filtergraph,
    '-map', '[out]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-y',
    params.outputPath,
  ])
}

async function mixNoMusic(params: MixAudioParams): Promise<void> {
  // 3-track mix: voiceover + ambient + SFX, no music layer
  const filtergraph = [
    `[1]volume=-20dB,aloop=loop=-1:size=2e9[amb]`,
    `[0][amb]amix=inputs=2:normalize=0[base]`,
    `[base][2]amix=inputs=2:normalize=0[premaster]`,
    `[premaster]loudnorm=I=-14:TP=-1.5:LRA=11[out]`,
  ].join(';')

  await execFileAsync('ffmpeg', [
    '-i', params.voiceoverPath,
    '-i', params.ambientPath,
    '-i', params.sfxPremixedPath,
    '-filter_complex', filtergraph,
    '-map', '[out]',
    '-c:a', 'aac', '-b:a', '192k',
    '-y', params.outputPath,
  ])
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

async function getAudioDurationMs(path: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'quiet', '-print_format', 'json', '-show_streams', path,
  ])
  const probe = JSON.parse(stdout) as { streams: Array<{ duration?: string }> }
  const dur = parseFloat(probe.streams[0]?.duration ?? '0')
  return Math.round(dur * 1000)
}
