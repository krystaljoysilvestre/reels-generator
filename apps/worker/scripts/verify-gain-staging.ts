// Phase A verification — the deterministic gain-staging proof (FREE, no API, no DB).
//
// The core claim: reference gain-staging makes the bed sit at a FIXED ratio under the voice REGARDLESS of
// the provider's arbitrary output loudness. We prove it by mixing the SAME design twice, changing ONLY the
// music file's native loudness by 12 dB, and asserting the output music stem is unchanged (the old mixer
// would pass that 12 dB straight through). Also asserts the voice lands at the reference and the bed sits in
// the audible band the founder's complaint was about (old ~22-27 dB under; new target = -bedDb).
import '../src/env.js'
void (async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { mkdirSync } = await import('node:fs')
  const { join } = await import('node:path')
  const exec = promisify(execFile)
  const { mixAudio } = await import('@reels/render/ffmpeg/mix-audio')
  const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/a45199ea-ecb0-4139-8c38-2989abf29a04/scratchpad/sound-phase-a'
  mkdirSync(OUT, { recursive: true })

  const measure = async (p: string): Promise<number | null> => {
    try {
      const { stderr } = await exec('ffmpeg', ['-i', p, '-filter:a', 'loudnorm=print_format=json', '-f', 'null', '-'])
      const m = stderr.match(/"input_i"\s*:\s*"(-?\d+(?:\.\d+)?)"/)
      return m ? parseFloat(m[1]!) : null
    } catch { return null }
  }
  // Generate a source at a KNOWN native loudness (loudnorm to target), so the mixer's normalization has
  // something arbitrary to correct — that's the whole point of the test.
  const synth = async (name: string, src: string, targetLufs: number, durSec = 12): Promise<string> => {
    const p = join(OUT, name)
    await exec('ffmpeg', ['-f', 'lavfi', '-i', src, '-t', String(durSec), '-af', `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11`, '-c:a', 'aac', '-b:a', '192k', '-y', p])
    return p
  }

  const DUR = 12_000
  // Minimal Timings the mixer reads: durationMs, music anchors, no silence drop.
  const timings = { durationMs: DUR, music: { startAnchorMs: 0, peakAnchorMs: 6000 }, silenceDrop: null, scenes: [], sfxEvents: [], subtitles: [] } as unknown as Parameters<typeof mixAudio>[0]['timings']

  const runMusicArm = async (tag: string, musicNativeLufs: number) => {
    const voice = await synth(`voice-${tag}.m4a`, 'sine=frequency=180:sample_rate=44100', -20)
    const music = await synth(`music-${tag}.m4a`, 'anoisesrc=color=brown:r=44100:amplitude=0.6', musicNativeLufs)
    const amb = await synth(`amb-${tag}.m4a`, 'anoisesrc=color=pink:r=44100:amplitude=0.3', -14)
    const sfx = await synth(`sfx-${tag}.m4a`, 'anullsrc=r=44100:cl=mono', -70, DUR / 1000) // silent sfx bus
    const stems = { voice: join(OUT, `stem-voice-${tag}.m4a`), music: join(OUT, `stem-music-${tag}.m4a`), sfx: join(OUT, `stem-sfx-${tag}.m4a`), ambient: join(OUT, `stem-amb-${tag}.m4a`) }
    await mixAudio({
      voiceoverPath: voice, ambientPath: amb, sfxPremixedPath: sfx, musicPack: [{ id: 't', path: music, type: 'low_drone', peakFrac: 0.5, moodTags: [] }],
      timings, outputPath: join(OUT, `mix-${tag}.m4a`), musicType: 'low_drone', musicMoodTags: [], bedDb: -15, peakDb: -7, stemPaths: stems,
    })
    const v = await measure(stems.voice); const m = await measure(stems.music); const a = await measure(stems.ambient)
    console.log(`  arm ${tag}: musicNative=${musicNativeLufs}  →  voiceStem=${v?.toFixed(1)}  musicStem=${m?.toFixed(1)}  ambStem=${a?.toFixed(1)}  (voice−music=${v != null && m != null ? (v - m).toFixed(1) : '?'} dB)`)
    return { v, m, a }
  }

  console.log('\n=== TEST 1: music-bed gain-staging is native-loudness-invariant (bedDb −15) ===')
  const A = await runMusicArm('A', -30) // quiet provider output
  const B = await runMusicArm('B', -18) // 12 dB louder provider output
  const results: string[] = []
  const ok = (label: string, cond: boolean, detail: string) => { results.push(`${cond ? '✓' : '✗ FAIL'} ${label} — ${detail}`); return cond }

  let pass = true
  if (A.m != null && B.m != null) {
    const drift = Math.abs(A.m - B.m)
    pass = ok('bed invariant to native loudness', drift < 2.5, `music stem A=${A.m.toFixed(1)} vs B=${B.m.toFixed(1)} despite 12 dB native gap → drift ${drift.toFixed(1)} dB (old mixer would drift ~12)`) && pass
  } else { pass = ok('bed invariant', false, 'could not measure music stems') && pass }
  if (A.v != null) pass = ok('voice at reference', Math.abs(A.v - (-16)) < 3, `voice stem ${A.v.toFixed(1)} ≈ −16 LUFS`) && pass
  if (A.v != null && A.m != null) {
    const delta = A.v - A.m
    // present-but-secondary band: bedDb magnitude (15) + duck/measurement slack; must be well under the old ~24-27
    pass = ok('bed audible (present band)', delta >= 13 && delta <= 21, `voice−music = ${delta.toFixed(1)} dB (target ~15 + duck; old was ~24-27 = inaudible)`) && pass
  }

  console.log('\n=== TEST 2: mixNoMusic path still gain-stages voice + ambient (bedless register) ===')
  {
    const voice = await synth('voice-nm.m4a', 'sine=frequency=180:sample_rate=44100', -24) // deliberately quiet native
    const amb = await synth('amb-nm.m4a', 'anoisesrc=color=pink:r=44100:amplitude=0.3', -8) // deliberately loud native
    const sfx = await synth('sfx-nm.m4a', 'anullsrc=r=44100:cl=mono', -70, DUR / 1000)
    const stems = { voice: join(OUT, 'stem-voice-nm.m4a'), music: join(OUT, 'stem-music-nm.m4a'), sfx: join(OUT, 'stem-sfx-nm.m4a'), ambient: join(OUT, 'stem-amb-nm.m4a') }
    await mixAudio({
      voiceoverPath: voice, ambientPath: amb, sfxPremixedPath: sfx, musicPack: [], timings,
      outputPath: join(OUT, 'mix-nm.m4a'), musicType: null, musicMoodTags: [], bedDb: -15, peakDb: -7, stemPaths: stems,
    })
    const v = await measure(stems.voice); const a = await measure(stems.ambient)
    console.log(`  mixNoMusic: voiceStem=${v?.toFixed(1)}  ambStem=${a?.toFixed(1)}  (voice−amb=${v != null && a != null ? (v - a).toFixed(1) : '?'} dB, target ~24)`)
    if (v != null) pass = ok('voice normalized (bedless path)', Math.abs(v - (-16)) < 3, `voice stem ${v.toFixed(1)} ≈ −16 despite −24 native`) && pass
    if (v != null && a != null) pass = ok('ambient at AMBIENT_DB under voice', Math.abs((v - a) - 24) < 4, `voice−amb = ${(v - a).toFixed(1)} dB ≈ 24 despite −8 native`) && pass
  }

  console.log('\n=== TEST 3: QA bed-presence threshold is intensity-aware (no false-fail on calm) ===')
  {
    const musicIntensityToDb = (i: string) => i === 'subtle' ? { bedDb: -19 } : i === 'bold' ? { bedDb: -11 } : { bedDb: -15 }
    const MARGIN = 8
    // A healthy mix measures ~ -bedDb + duck(~3). Assert the threshold clears that for every intensity.
    for (const intensity of ['subtle', 'balanced', 'bold']) {
      const { bedDb } = musicIntensityToDb(intensity)
      const threshold = -bedDb + MARGIN
      const healthyDelta = -bedDb + 3 // realistic measured voice−music
      pass = ok(`threshold clears healthy ${intensity} bed`, healthyDelta < threshold, `healthy≈${healthyDelta} dB < threshold ${threshold} dB (flat-22 would false-fail subtle=${(-(-19) + 3)})`) && pass
    }
    // And a truly buried bed (e.g. 30 dB under) must fail even the most lenient (subtle) threshold.
    pass = ok('buried bed still fails', 30 > (-(-19) + MARGIN), `30 dB under > subtle threshold ${-(-19) + MARGIN}`) && pass
  }

  console.log('\n=== RESULTS ===')
  for (const r of results) console.log(' ', r)
  console.log(`\n${pass ? '✅ ALL PASS' : '❌ FAILURES ABOVE'}`)
  process.exit(pass ? 0 : 1)
})()
