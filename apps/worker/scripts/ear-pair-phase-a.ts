// Phase A ear pair — a REAL before/after on the Tacoma reel's actual narration, for the founder's ears.
//
// The reel is on a bare probe channel (empty audioPacks, no audioMood, design de-biased to music:null), so
// it carries no bed of its own. To demonstrate the headline fix on real narration we generate ONE calm
// documentary bed and mix it — through the NEW gain-staged mixer both times — at:
//   BEFORE = bedDb −24  (≈ today's net level: the bed ~24 dB under the voice, "I can barely hear it")
//   AFTER  = bedDb −15  (Phase A 'balanced': present-but-secondary)
// Same voice, same bed → the ONLY variable is the target level Phase A changes. (Gain-staging determinism is
// proven separately in verify-gain-staging.ts; this is purely the ear demonstration.)  Cost: one ~30s bed gen.
import '../src/env.js'
void (async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  const exec = promisify(execFile)
  const { getDb, reels, assets } = await import('@reels/db')
  const { eq, and, desc } = await import('drizzle-orm')
  const { downloadBuffer, generateMusic } = await import('@reels/providers')
  const { mixAudio } = await import('@reels/render/ffmpeg/mix-audio')

  const rid = 'a2757168-325b-4436-ba19-8ccbed7d3ec1'
  const OUT = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/a45199ea-ecb0-4139-8c38-2989abf29a04/scratchpad/sound-phase-a'
  mkdirSync(OUT, { recursive: true })
  const db = getDb()

  const measure = async (p: string): Promise<number | null> => {
    try { const { stderr } = await exec('ffmpeg', ['-i', p, '-filter:a', 'loudnorm=print_format=json', '-f', 'null', '-']); const m = stderr.match(/"input_i"\s*:\s*"(-?\d+(?:\.\d+)?)"/); return m ? parseFloat(m[1]!) : null } catch { return null }
  }
  const durationSec = async (p: string): Promise<number> => {
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p])
    return parseFloat(stdout.trim())
  }

  // 1) Real Tacoma voiceover
  const vo = await db.query.assets.findFirst({ where: and(eq(assets.reelId, rid), eq(assets.kind, 'voiceover')), orderBy: [desc(assets.createdAt)] })
  if (!vo) { console.log('no voiceover asset'); process.exit(1) }
  const voicePath = join(OUT, 'voice.mp3')
  writeFileSync(voicePath, await downloadBuffer(vo.storageKey))
  const durSec = await durationSec(voicePath)
  const durMs = Math.round(durSec * 1000)
  console.log(`voiceover: ${vo.storageKey} · ${durSec.toFixed(1)}s`)

  // 2) One calm documentary bed (looped by the mixer to cover the reel)
  const bedPath = join(OUT, 'bed.mp3')
  console.log('generating calm documentary bed (~30s)…')
  const bed = await generateMusic({ prompt: 'calm, measured documentary underscore: sparse sustained warm strings and soft piano, unhurried, dignified, reflective, no percussion, no melody hooks — a quiet bed under narration', lengthMs: 30_000 })
  writeFileSync(bedPath, bed.audio)
  console.log(`bed: ${(bed.audio.length / 1024).toFixed(0)} KB · recorded cost ${bed.costCents}¢`)

  // 3) Room-tone ambient (mixer normalizes its level) + silent SFX bus
  const ambPath = join(OUT, 'amb.mp3')
  await exec('ffmpeg', ['-f', 'lavfi', '-i', 'anoisesrc=color=pink:r=44100:amplitude=0.1', '-af', 'lowpass=f=500,highpass=f=40', '-t', String(durSec), '-c:a', 'libmp3lame', '-y', ambPath])
  const sfxPath = join(OUT, 'sfx.m4a')
  await exec('ffmpeg', ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', String(durSec), '-c:a', 'aac', '-y', sfxPath])

  const timings = { durationMs: durMs, music: { startAnchorMs: 0, peakAnchorMs: Math.round(durMs * 0.6) }, silenceDrop: null, scenes: [], sfxEvents: [], subtitles: [] } as unknown as Parameters<typeof mixAudio>[0]['timings']

  const arm = async (tag: string, bedDb: number, peakDb: number, withStems: boolean) => {
    const out = join(OUT, `${tag}.m4a`)
    const stems = withStems ? { voice: join(OUT, `${tag}-voice.m4a`), music: join(OUT, `${tag}-music.m4a`), sfx: join(OUT, `${tag}-sfx.m4a`), ambient: join(OUT, `${tag}-amb.m4a`) } : undefined
    await mixAudio({ voiceoverPath: voicePath, ambientPath: ambPath, sfxPremixedPath: sfxPath, musicPack: [{ id: 'bed', path: bedPath, type: 'low_drone', peakFrac: 0.6, moodTags: [] }], timings, outputPath: out, musicType: 'low_drone', musicMoodTags: [], bedDb, peakDb, ...(stems ? { stemPaths: stems } : {}) })
    if (stems) { const v = await measure(stems.voice); const m = await measure(stems.music); console.log(`  ${tag}: voice−music = ${v != null && m != null ? (v - m).toFixed(1) : '?'} dB (voiceStem ${v?.toFixed(1)}, musicStem ${m?.toFixed(1)})`) }
    return out
  }

  console.log('\nmixing…')
  const before = await arm('before', -24, -14, false) // ≈ today's net bed level
  const after = await arm('after', -15, -7, true)     // Phase A 'balanced'

  // Blind names on the Desktop; key withheld until the founder judges.
  const home = process.env.HOME
  await exec('cp', [after, `${home}/Desktop/reel-sound-1.m4a`])
  await exec('cp', [before, `${home}/Desktop/reel-sound-2.m4a`])
  console.log('\n→ ~/Desktop/reel-sound-1.m4a + reel-sound-2.m4a (blind; key withheld)')
  console.log(`recorded bed cost (music, new length-scaled accounting): ${bed.costCents}¢`)
  process.exit(0)
})()
