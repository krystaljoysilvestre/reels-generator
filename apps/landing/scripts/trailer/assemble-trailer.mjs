// The full cut: nine narration-driven beats, light-flash transitions, then beat 10's finale, mixed
// against the bed and muxed. Ends with the deliverables the landing page would embed:
//   out/trailer-final.mp4   1080×1920, loudness-normalised master
//   out/trailer-web.mp4     720×1280, the web cut
//   out/trailer-poster.jpg  the poster frame
// Free to re-run: ffmpeg only, no API calls.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { AUDIO, CLIPS, OUT, WORK, ensureDirs } from './paths.mjs'
import { buildCues, renderCaptions } from './shoot-motion.mjs'

ensureDirs()
const G = `${WORK}/seg`
execSync(`mkdir -p ${G}`)

const sh = (c) => {
  try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) {
    console.error('FAILED:', c.slice(0, 240))
    console.error(String(e.stderr).split('\n').slice(-5).join('\n'))
    throw new Error('stop')
  }
}
const dur = (f) => Number(sh(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 ${f}`).toString().trim())
const ENC = '-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -an'
const TEMPO = 1.06, GAP = 0.30, XF = 0.18
const LUFS = -14 // the platform target the master is normalised to

// Beat = its narration line + a breath. Window chosen per beat so the motion peaks on screen.
const BEATS = [
  { n: 1, ss: 0.0 }, { n: 2, ss: 1.0 }, { n: 3, ss: 1.2 }, { n: 4, ss: 0.8 },
  { n: 5, ss: 1.5 }, { n: 6, ss: 0.85 }, { n: 7, ss: 1.4 }, { n: 8, ss: 1.45 },
]

// 1) speed-corrected VO
const voDur = []
for (let i = 1; i <= 10; i++) {
  sh(`ffmpeg -y -i ${AUDIO}/t${i}.mp3 -filter:a atempo=${TEMPO} -ar 44100 ${AUDIO}/s${i}.mp3`)
  voDur[i] = dur(`${AUDIO}/s${i}.mp3`)
}

// 1b) "Kendrix." gets its own beat. The founder's note: the brand name currently shares its moment
// with the app UI and hands straight off to the card, when it deserves half a second of air before
// "Build stories people can't stop watching."
//
// The pause is widened in the SPEECH only — the score keeps playing underneath (see the bed, below).
// The split point is measured, not assumed: silencedetect finds the gap after the name, and the cut
// lands in the MIDDLE of that silence so no consonant tail or onset is clipped.
const gapProbe = sh(`ffmpeg -hide_banner -i ${AUDIO}/s10.mp3 -af silencedetect=noise=-40dB:d=0.15 -f null - 2>&1`).toString()
const gap = [...gapProbe.matchAll(/silence_start:\s*([\d.]+)[\s\S]*?silence_end:\s*([\d.]+)/g)]
  .map((m) => ({ start: Number(m[1]), end: Number(m[2]) }))
  .find((g) => g.start > 0.3) // the pause AFTER the name, not a break inside it
if (!gap) throw new Error('could not find the pause after "Kendrix." in s10.mp3 — inspect it by hand')
const AIR = 0.55 // the founder asked for 500–700ms
const cutAt = +((gap.start + gap.end) / 2).toFixed(3)
sh(`ffmpeg -y -i ${AUDIO}/s10.mp3 -f lavfi -t ${AIR} -i anullsrc=r=44100:cl=stereo -filter_complex '[0:a]asplit=2[x][y];[x]atrim=0:${cutAt},asetpts=N/SR/TB,aformat=sample_rates=44100:channel_layouts=stereo[a];[y]atrim=${cutAt},asetpts=N/SR/TB,aformat=sample_rates=44100:channel_layouts=stereo[b];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[s];[a][s][b]concat=n=3:v=0:a=1[out]' -map '[out]' ${WORK}/s10-air.mp3`)
const S10 = `${WORK}/s10-air.mp3`
voDur[10] = dur(S10)
console.log(`"Kendrix." pause: ${(gap.end - gap.start).toFixed(2)}s → ${(gap.end - gap.start + AIR).toFixed(2)}s (split at ${cutAt}s)`)

// 1c) The bed — three parts, because no single generated bed fits the cut:
//   OPEN   music42 0→8s      — music36's own opening is near-silent by design ("opens almost silent"),
//                              and under volume=0.34 that measured 30–50 dB below the narration: for
//                              seven seconds there was no music at all, then it ENTERED at 8s with a
//                              16 dB jump. music42's opening is 15–19 dB hotter and actually builds.
//   BUILD  music36 8→31.5s   — the approved arc: peak on the montage, drop as the finale opens.
//   CLOSE  music42 43→56s    — the resolve and decay the new ending needs.
// Both seams sit where the two sources are within ~3 dB of each other, so the joins are masked.
const BED_OPEN_UNTIL = 8.0, BED_BUILD_FROM = 8.0, BED_BUILD_UNTIL = 31.5
const BED_CLOSE_FROM = 43, BED_CLOSE_UNTIL = 56
const BED_XF_OPEN = 1.0, BED_XF_CLOSE = 2.0
// A gentle decaying lift over the first seconds so the low sustained note is present from the first
// frame rather than fading up into the narration. exp() keeps the expression comma-free, which matters
// because a comma inside a filtergraph option reads as the next filter.
const BED_LIFT = `volume=1+1.6*exp(-0.5*t):eval=frame`
const BED = `${WORK}/bed.mp3`
if (!existsSync(`${AUDIO}/music42.mp3`)) throw new Error(`no ${AUDIO}/music42.mp3 — run gen-trailer-audio.mjs music`)
const fmt = 'asetpts=N/SR/TB,aformat=sample_rates=44100:channel_layouts=stereo'
sh(`ffmpeg -y -i ${AUDIO}/music36.mp3 -i ${AUDIO}/music42.mp3 -filter_complex '[1:a]atrim=0:${BED_OPEN_UNTIL},${fmt},${BED_LIFT}[open];[0:a]atrim=${BED_BUILD_FROM}:${BED_BUILD_UNTIL},${fmt}[build];[1:a]atrim=${BED_CLOSE_FROM}:${BED_CLOSE_UNTIL},${fmt}[close];[open][build]acrossfade=d=${BED_XF_OPEN}:c1=tri:c2=tri[ab];[ab][close]acrossfade=d=${BED_XF_CLOSE}:c1=tri:c2=tri[out]' -map '[out]' -c:a libmp3lame -q:a 2 ${BED}`)
const bedDur = dur(BED)

// 2) normalise each beat to 9:16 / 30fps, length = VO + breath
const segs = []
for (const b of BEATS) {
  const d = Math.max(2.4, +(voDur[b.n] + GAP).toFixed(2))
  sh(`ffmpeg -y -ss ${b.ss} -t ${d} -i ${CLIPS}/clip-beat${b.n}.mp4 -vf 'crop=992:1764,scale=1080:1920,setsar=1' ${ENC} ${G}/s${b.n}.mp4`)
  const actual = dur(`${G}/s${b.n}.mp4`)
  if (Math.abs(actual - d) > 0.08) console.warn(`  beat ${b.n}: asked ${d}s, got ${actual.toFixed(2)}s`)
  segs.push({ f: `${G}/s${b.n}.mp4`, d: actual })
}
sh(`ffmpeg -y -i ${CLIPS}/beat9-montage.mp4 -vf 'scale=1080:1920,setsar=1' ${ENC} ${G}/s9.mp4`)
segs.push({ f: `${G}/s9.mp4`, d: dur(`${G}/s9.mp4`) })

// 3) light-flash (fadewhite) transitions — the signature that makes the cuts feel inevitable
let filter = '', prev = '[0:v]', acc = segs[0].d
const starts = [0]
for (let i = 1; i < segs.length; i++) {
  const off = +(acc - XF).toFixed(3)
  const out = i === segs.length - 1 ? '[vstory]' : `[v${i}]`
  filter += `${prev}[${i}:v]xfade=transition=fadewhite:duration=${XF}:offset=${off}${out};`
  prev = out
  starts.push(+(acc - XF).toFixed(3))
  acc = +(acc + segs[i].d - XF).toFixed(3)
}
sh(`ffmpeg -y ${segs.map((s) => `-i ${s.f}`).join(' ')} -filter_complex '${filter.slice(0, -1)}' -map '[vstory]' ${ENC} ${G}/story.mp4`)
const storyDur = dur(`${G}/story.mp4`)
// Each beat's caption/voice start: the segment's own start plus the small lead-in. Needed by the
// caption pass below as well as the mix, so it is computed here rather than inside step 5.
const voAt = starts.map((s) => +(s + 0.12).toFixed(2))

// 3b) burned captions — over the STORY only.
//
// The landing hero autoplays muted, so captions are the only way a muted viewer gets the narration:
// without them the trailer is pretty pictures. They are set in the product's own `cinematic` preset —
// the exact style the reel inside this trailer already burns — so the film's captions turn out to be
// the product's captions.
//
// Applied here, before the finale is joined, which makes the handoff STRUCTURAL rather than a rule
// someone has to remember: from the pull-back on, the thing on screen carries its own captions, and
// then the brand speaks in its own type.
const cues = await renderCaptions(buildCues(voAt, voDur))
let capFilter = '[0:v]null[v0];'
cues.forEach((c, i) => {
  // tpad delays each transparent clip to its cue time; overlay=shortest=0 keeps the story's length.
  capFilter += `[${i + 1}:v]format=argb,tpad=start_duration=${c.at.toFixed(3)}:start_mode=add:color=0x00000000[c${i}];`
  capFilter += `[v${i}][c${i}]overlay=x=0:y=0:eof_action=pass:shortest=0[v${i + 1}];`
})
sh(`ffmpeg -y -i ${G}/story.mp4 ${cues.map((c) => `-i ${c.clip}`).join(' ')} -filter_complex '${capFilter}' -map '[v${cues.length}]' -t ${storyDur.toFixed(3)} ${ENC} ${G}/story-cap.mp4`)
const capDur = dur(`${G}/story-cap.mp4`)
if (Math.abs(capDur - storyDur) > 0.08) throw new Error(`captioning changed the story length: ${storyDur} → ${capDur}`)
console.log(`captions: ${cues.length} cues over ${storyDur.toFixed(2)}s of story (none past the pull-back)`)

// 4) video = story + finale
writeFileSync(`${G}/l.txt`, `file '${G}/story-cap.mp4'\nfile '${CLIPS}/beat10-finale.mp4'\n`)
sh(`ffmpeg -y -f concat -safe 0 -i ${G}/l.txt -c copy ${G}/video.mp4`)
const total = dur(`${G}/video.mp4`)
const finaleStart = storyDur

// 5) audio: VO on the beats, vo9 on the montage, and vo10 anchored to the PICTURE.
//
// This used to be `finaleStart + 3.1` — a magic number. Cut 3 inverts the dependency for this one
// line: "Kendrix." must land on the exact frame the K resolves out of the gradient, so build-finale
// publishes its shot boundaries and the marker, and the audio reads them. Change a shot length and
// the voice follows; nobody has to redo arithmetic.
const SHOTS_FILE = `${CLIPS}/beat10-shots.json`
if (!existsSync(SHOTS_FILE)) throw new Error(`no ${SHOTS_FILE} — run build-finale.mjs first`)
const beat10 = JSON.parse(readFileSync(SHOTS_FILE, 'utf8'))
const vo10At = +(finaleStart + beat10.markers.kResolvesAt).toFixed(3)
if (Math.abs(beat10.total - dur(`${CLIPS}/beat10-finale.mp4`)) > 0.05) {
  throw new Error('beat10-shots.json does not match beat10-finale.mp4 — re-run build-finale.mjs')
}
// A 1.2s fade-in used to compound the near-silent opening; 0.35s is enough to avoid a click.
let af = `[0:a]volume=0.34,afade=t=in:st=0:d=0.35,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[mus];`
af += `[1:a]adelay=200|200,volume=0.5[hb1];`
af += `[2:a]adelay=${Math.round((finaleStart + 5.6) * 1000)}|${Math.round((finaleStart + 5.6) * 1000)},volume=0.45[hb2];`
segs.forEach((_, i) => {
  const ms = Math.round(voAt[i] * 1000)
  af += `[${i + 3}:a]adelay=${ms}|${ms},volume=1.35[vo${i + 1}];`
})
af += `[${segs.length + 3}:a]adelay=${Math.round(vo10At * 1000)}|${Math.round(vo10At * 1000)},volume=1.35[vo10];`
af += `[mus][hb1][hb2]${segs.map((_, i) => `[vo${i + 1}]`).join('')}[vo10]amix=inputs=${segs.length + 4}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,aresample=48000[aout]`
// The bed must outlast the picture. A bed that runs out is exactly the failure the endings lap
// diagnosed — the music was cut off at full volume, and the reel "just stopped". Fail loudly.
if (bedDur < total) {
  throw new Error(`bed is ${bedDur.toFixed(2)}s but the cut is ${total.toFixed(2)}s — the music would run out`)
}
const ins = [`-i ${BED}`, `-i ${AUDIO}/heartbeat.mp3`, `-i ${AUDIO}/heartbeat.mp3`,
  ...segs.map((_, i) => `-i ${AUDIO}/s${i + 1}.mp3`), `-i ${S10}`].join(' ')
sh(`ffmpeg -y ${ins} -filter_complex '${af}' -map '[aout]' -t ${total.toFixed(2)} -c:a aac -b:a 192k ${G}/mix.m4a`)

// 6) mux
sh(`ffmpeg -y -i ${G}/video.mp4 -i ${G}/mix.m4a -map 0:v -map 1:a -c:v copy -c:a copy -movflags +faststart ${G}/trailer-master.mp4`)

// 7) loudness — two-pass loudnorm so the master lands ON the target rather than near it
const probe = sh(`ffmpeg -hide_banner -i ${G}/trailer-master.mp4 -af loudnorm=I=${LUFS}:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`).toString()
const m = JSON.parse(probe.slice(probe.lastIndexOf('{'), probe.lastIndexOf('}') + 1))
const pass2 = `loudnorm=I=${LUFS}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`
sh(`ffmpeg -y -i ${G}/trailer-master.mp4 -af '${pass2},aresample=48000' -c:v copy -c:a aac -b:a 192k -movflags +faststart ${OUT}/trailer-final.mp4`)

// 8) the web cut + poster. CRF 25 keeps the hero around 7 MB — the dark gradients band badly if
// it's pushed much further, and this is a file every landing visitor downloads.
sh(`ffmpeg -y -i ${OUT}/trailer-final.mp4 -vf 'scale=720:1280' -c:v libx264 -crf 25 -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart ${OUT}/trailer-web.mp4`)
sh(`ffmpeg -y -ss 1.2 -i ${OUT}/trailer-web.mp4 -frames:v 1 -update 1 -q:v 3 ${OUT}/trailer-poster.jpg`)

const after = sh(`ffmpeg -hide_banner -i ${OUT}/trailer-final.mp4 -af loudnorm=I=${LUFS}:TP=-1.5:LRA=11:print_format=json -f null - 2>&1`).toString()
const verify = JSON.parse(after.slice(after.lastIndexOf('{'), after.lastIndexOf('}') + 1))
console.log('beat lengths:', segs.map((s) => s.d).join(' '))
console.log('vo starts:', voAt.join(' '), '| vo10 @', vo10At)
console.log('story:', storyDur.toFixed(2), 'finale starts:', finaleStart.toFixed(2), 'TOTAL:', total.toFixed(2))
console.log(`bed: ${bedDur.toFixed(2)}s (covers the cut by ${(bedDur - total).toFixed(2)}s)`)
console.log(`"Kendrix." lands at ${vo10At.toFixed(2)}s = the frame the K resolves (marker +${beat10.markers.kResolvesAt}s)`)
console.log(`loudness: ${m.input_i} LUFS in → ${verify.input_i} LUFS out (target ${LUFS}), peak ${verify.input_tp} dBTP`)
console.log(`→ ${OUT}/trailer-final.mp4 · trailer-web.mp4 · trailer-poster.jpg`)
