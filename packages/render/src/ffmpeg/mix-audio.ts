// mix_audio FFmpeg recipe — docs/07 §3
// Layer order: voiceover (master) → ambient → music (looped+enveloped+ducked) → SFX → loudnorm
// Music is mixed BEFORE SFX so stings sit cleanly on top. The music track is a LOCAL file the
// caller already downloaded (track.path) — beds are flat/loopable, so we loop (not stretch) it.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rename } from 'node:fs/promises'
import type { MusicTrack } from '@reels/core'
import type { Timings } from '@reels/core'
import { buildGainExpr } from '../music/music-sync.js'
import { selectMusicTrack } from '../music/music-selection.js'

const execFileAsync = promisify(execFile)

// Where to write the four per-layer stems. When provided, mixAudio writes them (in a SEPARATE ffmpeg run
// from the final encode, so the loudnorm measure pass is untouched). Stems are the layers as they enter
// the mix — PRE-loudnorm — so summing them ≈ the mix minus the final loudness gain (documented, expected).
export interface StemPaths {
  voice: string
  music: string
  sfx: string
  ambient: string
}

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
  stemPaths?: StemPaths       // when set, also persist the 4 layers as separate files
}

// ── Reference gain-staging (Phase A, 2026-07-24) ──────────────────────────────────────────────────────
// Every layer is normalized to VOICE_REF_LUFS *before* its offset is applied, so bedDb / AMBIENT_DB are
// TRUE dB-under-the-voice, not offsets on each provider's arbitrary output loudness. Previously voice/music/
// ambient entered the mix at whatever loudness ElevenLabs emitted and only the summed premaster was
// loudnorm'd (voice-dominated) — so the voice:bed ratio drifted per reel and the bed sat ~22–27 dB under the
// voice (below the WCAG 20 dB floor → "I can barely hear it"). Normalizing voice AND bed to the same
// reference makes the final loudnorm gain deterministic, so bedDb is the ratio you actually hear.
const VOICE_REF_LUFS = -16
// Bed/peak fallback (dB UNDER the reference voice) when the caller passes none — matches musicIntensityToDb
// 'balanced'. The pipeline always passes intensity-derived values; this only covers direct/test callers.
const DEFAULT_BED_DB = -15
const DEFAULT_PEAK_DB = -7
// Ambient (environmental room-tone) level, dB under the reference voice — a fixed layer independent of the
// music-intensity slider, so ambient sits at the same level whether or not a music bed is present.
const AMBIENT_DB = -24
// How far ambient dips during a silenceDrop. Music hard-zeros in the drop; ambient must NOT (a dead,
// perfectly silent dropout reads as an encode glitch, not tension) — so it ducks by this much and stays
// alive. The SFX bus is left un-dipped so the climax hit punches through the quiet.
const AMBIENT_SILENCE_DIP_DB = 12
// SFX-bus lift. A presence lift so effects aren't buried — but NOT so much that ambient/realism/dread climb
// up near the voice. Owner (2026-07-10): the voiceover is the reference; music + ambient + non-climax SFX
// must sit clearly UNDER it, and only the payoff hit (a +6dB cue) exceeds the voice. History: +6 (pushed a
// -8 realism cue to ~-2, near voice) → +2 → +4 (Phase A: with the bed re-leveled the +2 bus left presence
// cues inaudible; +4 keeps realism a few dB under the voice, the +6 climax cue still clearly loudest). NOTE:
// the SFX bus is intentionally NOT reference-normalized — a sparse cue bus has no meaningful integrated LUFS.
const SFX_BUS_DB = 4

// Final loudness normalization → render_qa requires -14 ±0.5 LUFS. ffmpeg's loudnorm (single- OR
// two-pass) undershoots on speech-crest content: to honor the -1.5 dBTP ceiling it backs off the
// gain and lands ~1–2 LU quiet. Instead we gain the premaster straight to target and let a limiter
// hold the peaks; the limiter shaves a little loudness, so we measure and apply one corrective gain.
const TARGET_LUFS = -14
const TRUE_PEAK = -1.5

const dbToLin = (db: number): number => 10 ** (db / 20)

// Ambient chain for input [1]. When a silenceDrop exists, ambient ducks (not zeros) inside the window so
// the quiet reads as intentional, not as an audio bug. Loop is applied BEFORE the volume expression so
// `t` runs on the reel timeline (looping first, then a time-varying volume, avoids the dip repeating each
// loop of the source bed).
function ambientFilter(
  silenceDrop: { atMs: number; durationMs: number } | null,
  normGainDb: number,
  // Outro tail (§4.65): under the held closing image the score has stepped back, so an abruptly
  // truncated room tone becomes the loudest thing in the mix. Ramp it out with the picture.
  tail?: { outroTailMs: number; durationMs: number },
): string {
  // normGainDb brings the ambient FILE to VOICE_REF_LUFS; AMBIENT_DB is then the true offset under the voice.
  const level = normGainDb + AMBIENT_DB
  const nom = dbToLin(level).toFixed(5)
  const hasTail = !!tail && tail.outroTailMs > 0 && tail.durationMs > tail.outroTailMs
  const voiceEnd = hasTail ? ((tail!.durationMs - tail!.outroTailMs) / 1000).toFixed(3) : '0'
  const tailSec = hasTail ? (tail!.outroTailMs / 1000).toFixed(3) : '1'
  // rides at nominal until the voice stops, then ramps to silence across the tail
  const base = hasTail
    ? `if(lt(t,${voiceEnd}),${nom},${nom}*(1-((t-${voiceEnd})/${tailSec})))`
    : nom

  if (!silenceDrop) {
    if (!hasTail) return `[1]volume=${level.toFixed(2)}dB,aloop=loop=-1:size=2e9[amb]`
    return `[1]aloop=loop=-1:size=2e9,volume='${base}':eval=frame[amb]`
  }
  const dip = dbToLin(level - AMBIENT_SILENCE_DIP_DB).toFixed(5)
  const s = (silenceDrop.atMs / 1000).toFixed(3)
  const en = ((silenceDrop.atMs + silenceDrop.durationMs) / 1000).toFixed(3)
  return `[1]aloop=loop=-1:size=2e9,volume='if(between(t,${s},${en}),${dip},${base})':eval=frame[amb]`
}

// The outro-tail window for the ambient ramp, or undefined when this reel has no tail (§4.65).
function ambientTailOf(timings: Timings): { outroTailMs: number; durationMs: number } | undefined {
  return timings.outroTailMs ? { outroTailMs: timings.outroTailMs, durationMs: timings.durationMs } : undefined
}

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

// The gain (dB) that brings a file to VOICE_REF_LUFS — the heart of reference gain-staging. Each layer is
// normalized to this reference before its own offset, so offsets are true voice-relative ratios (not offsets
// on each provider's arbitrary loudness). Unmeasurable (silent/too-short/error) → 0 dB (the old un-normalized
// behavior) with a log, never a throw.
async function refGain(path: string, label: string): Promise<number> {
  const i = await measureFile(path)
  if (i == null) { console.log(`[mix] ${label} loudness unmeasurable → 0dB gain (no normalization)`); return 0 }
  return VOICE_REF_LUFS - i
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
  // The limiter shaves integrated loudness — measure the result and correct. A single pass isn't always
  // enough on crest-heavy mixes (a hot jumpscare stinger makes the limiter eat several LU; the corrective
  // gain gets partially re-limited too), so iterate until within tolerance, max 3 passes.
  for (let pass = 0; pass < 3; pass++) {
    const i1 = await measureFile(outputPath)
    if (i1 == null || Math.abs(TARGET_LUFS - i1) <= 0.25) break
    const corrected = `${outputPath}.norm.m4a`
    // Re-limit after the corrective gain. The correction is usually POSITIVE (the limiter left the mix
    // quieter than target), which would push peaks back above the true-peak ceiling the limiter just
    // enforced — inter-sample clipping. A second alimiter caps them again.
    await execFileAsync('ffmpeg', [
      '-i', outputPath, '-af', `volume=${(TARGET_LUFS - i1).toFixed(2)}dB,alimiter=limit=${TRUE_PEAK}dB:level=false`,
      '-c:a', 'aac', '-b:a', '192k', '-y', corrected,
    ])
    await rename(corrected, outputPath)
  }
}

// Encode one layer node (already bounded by -t) to an aac stem file.
function stemOutputArgs(mapLabel: string, durationSec: number, path: string): string[] {
  return ['-map', mapLabel, '-t', String(durationSec), '-c:a', 'aac', '-b:a', '192k', path]
}

async function writeSilenceStem(path: string, durationSec: number): Promise<void> {
  await execFileAsync('ffmpeg', ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(durationSec), '-c:a', 'aac', '-b:a', '192k', '-y', path])
}

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
  // The bed resolves across the outro tail rather than being hard-cut at peak by `-t` (§4.65).
  if (params.timings.outroTailMs) {
    gainParams.outroTailMs = params.timings.outroTailMs
  }
  const gainExpr = buildGainExpr(gainParams)

  // Room tone resolves with the picture across the outro tail (§4.65).
  const ambientTail = ambientTailOf(params.timings)

  // Reference gain-stage each layer to VOICE_REF_LUFS before its offset (see VOICE_REF_LUFS). These run as
  // analysis-only ffmpeg passes (no output) before the mix, so the voice:bed ratio is deterministic.
  const voiceGain = await refGain(params.voiceoverPath, 'voice')
  const musicGain = await refGain(track.path, 'music')
  const ambientGain = await refGain(params.ambientPath, 'ambient')
  console.log(`[mix] gain-stage → ref ${VOICE_REF_LUFS} LUFS: voice ${voiceGain.toFixed(1)}dB, music ${musicGain.toFixed(1)}dB, ambient ${ambientGain.toFixed(1)}dB; bed ${bedDb}dB under voice`)

  // §3 Full filtergraph — everything up to [premaster]; the loudnorm tail is added by encodeWithLoudnorm.
  const inputs = [
    '-i', params.voiceoverPath,
    '-i', params.ambientPath,
    '-i', track.path,
    '-i', params.sfxPremixedPath,
  ]
  const pre = [
    // ambient: normalize to ref, then loop to cover full duration at AMBIENT_DB under voice (dips in a drop)
    ambientFilter(params.timings.silenceDrop, ambientGain, ambientTail),
    // music: normalize the bed to ref, loop to cover the reel, then the bedDb→peakDb volume envelope
    `[2]volume=${musicGain.toFixed(2)}dB,aloop=loop=-1:size=2e9,volume='${gainExpr}':eval=frame[mus0]`,
    // sidechain duck: music dips under the voiceover, but stays PRESENT. ratio 6 held the bed ~8–10dB down
    // for the whole narration (VO is near-continuous) — read as silent/absent (owner 2026-07-06). ratio 3
    // ducked ~4–5dB; Phase A → ratio 2 (~2.5–3.5dB) since the bed now sits at a true, higher baseline — the
    // duck should shade it under the words, not bury it. Still releases (400ms) so it swells back in pauses.
    `[0]volume=${voiceGain.toFixed(2)}dB,asplit=2[vox][voxkey]`,
    `[mus0][voxkey]sidechaincompress=threshold=0.04:ratio=2:attack=20:release=400[musduck]`,
    // mix layers (SFX lifted so effects sit clearly under the voice, not buried)
    `[3]volume=${SFX_BUS_DB}dB[sfxb]`,
    `[vox][amb]amix=inputs=2:normalize=0[base]`,
    `[base][musduck]amix=inputs=2:normalize=0[withmus]`,
    `[withmus][sfxb]amix=inputs=2:normalize=0[premaster]`,
  ]
  const durationSec = params.timings.durationMs / 1000
  await encodeWithLoudnorm(inputs, pre, durationSec, params.outputPath)

  // Stems (separate run — keeps encodeWithLoudnorm's measure pass free of unconnected outputs). The 4
  // layer nodes are rebuilt here and each mapped to its own file in ONE ffmpeg process.
  if (params.stemPaths) {
    const stemGraph = [
      ambientFilter(params.timings.silenceDrop, ambientGain, ambientTail),
      `[2]volume=${musicGain.toFixed(2)}dB,aloop=loop=-1:size=2e9,volume='${gainExpr}':eval=frame[mus0]`,
      `[0]volume=${voiceGain.toFixed(2)}dB,asplit=2[vox][voxkey]`,
      `[mus0][voxkey]sidechaincompress=threshold=0.04:ratio=2:attack=20:release=400[musduck]`,
      `[3]volume=${SFX_BUS_DB}dB[sfxb]`,
    ].join(';')
    await execFileAsync('ffmpeg', [
      ...inputs, '-filter_complex', stemGraph, '-y',
      ...stemOutputArgs('[vox]', durationSec, params.stemPaths.voice),
      ...stemOutputArgs('[amb]', durationSec, params.stemPaths.ambient),
      ...stemOutputArgs('[musduck]', durationSec, params.stemPaths.music),
      ...stemOutputArgs('[sfxb]', durationSec, params.stemPaths.sfx),
    ])
  }
}

async function mixNoMusic(params: MixAudioParams): Promise<void> {
  // 3-track mix: voiceover + ambient + SFX, no music layer. Voice + ambient are still reference gain-staged
  // (VOICE_REF_LUFS) so ambient sits at a deterministic AMBIENT_DB under the voice, same as the music path.
  const inputs = [
    '-i', params.voiceoverPath,
    '-i', params.ambientPath,
    '-i', params.sfxPremixedPath,
  ]
  const voiceGain = await refGain(params.voiceoverPath, 'voice')
  const ambientGain = await refGain(params.ambientPath, 'ambient')
  const ambientTail = ambientTailOf(params.timings)
  const pre = [
    ambientFilter(params.timings.silenceDrop, ambientGain, ambientTail),
    `[2]volume=${SFX_BUS_DB}dB[sfxb]`,
    `[0]volume=${voiceGain.toFixed(2)}dB[vox]`,
    `[vox][amb]amix=inputs=2:normalize=0[base]`,
    `[base][sfxb]amix=inputs=2:normalize=0[premaster]`,
  ]
  const durationSec = params.timings.durationMs / 1000
  await encodeWithLoudnorm(inputs, pre, durationSec, params.outputPath)

  if (params.stemPaths) {
    const stemGraph = [
      ambientFilter(params.timings.silenceDrop, ambientGain, ambientTail),
      `[2]volume=${SFX_BUS_DB}dB[sfxb]`,
      `[0]volume=${voiceGain.toFixed(2)}dB[vox]`,
    ].join(';')
    await execFileAsync('ffmpeg', [
      ...inputs, '-filter_complex', stemGraph, '-y',
      ...stemOutputArgs('[vox]', durationSec, params.stemPaths.voice),
      ...stemOutputArgs('[amb]', durationSec, params.stemPaths.ambient),
      ...stemOutputArgs('[sfxb]', durationSec, params.stemPaths.sfx),
    ])
    // No music layer in this path → a silent music stem keeps the 4-stem contract constant.
    await writeSilenceStem(params.stemPaths.music, durationSec)
  }
}

// SFX pre-mix: place each SFX file at its timestamp into a silent base track. A sustained event
// (endMs set) is LOOPED to fill [atMs, endMs] and faded in/out so the texture melts into the mix
// instead of clicking on and off — this is what carries a heartbeat under a whole walk, or a corridor
// tone under a scene, from a single ~10s seamless-loop clip.
export async function premixSfx(params: {
  sfxEvents: Array<{ storageKey: string; atMs: number; volumeDb: number; endMs?: number | undefined }>
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
    if (ev.endMs != null && ev.endMs > ev.atMs) {
      const spanSec = (ev.endMs - ev.atMs) / 1000
      // Fades scale down for short spans so fade-in + fade-out never exceed the span itself.
      const fadeIn = Math.min(1.5, spanSec / 4)
      const fadeOut = Math.min(2.5, spanSec / 4)
      const fadeOutStart = Math.max(0, spanSec - fadeOut)
      delayFilters.push(
        `[${i}]aloop=loop=-1:size=2e9,atrim=0:${spanSec.toFixed(3)},` +
        `afade=t=in:d=${fadeIn.toFixed(2)},afade=t=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)},` +
        `volume=${ev.volumeDb}dB,adelay=${ev.atMs}|${ev.atMs}[sfx${i}]`,
      )
    } else {
      delayFilters.push(`[${i}]volume=${ev.volumeDb}dB,adelay=${ev.atMs}|${ev.atMs}[sfx${i}]`)
    }
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

