import { execSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const S = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad'
const T = `${S}/trailer`, A = `${T}/audio`, G = `${T}/seg`
mkdirSync(G, { recursive: true })
const sh = (c) => {
  try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { console.error('FAILED:', c.replace(new RegExp(S, 'g'), '…').slice(0, 240)); console.error(String(e.stderr).split('\n').slice(-5).join('\n')); throw new Error('stop') }
}
const dur = (f) => Number(sh(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 ${f}`).toString().trim())
const ENC = '-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -an'
const TEMPO = 1.06, GAP = 0.30, XF = 0.18

// Beat = its narration line + a breath. Window chosen per beat so the motion peaks on screen.
const BEATS = [
  { n: 1, ss: 0.0 }, { n: 2, ss: 1.0 }, { n: 3, ss: 1.2 }, { n: 4, ss: 0.8 },
  { n: 5, ss: 1.5 }, { n: 6, ss: 0.85 }, { n: 7, ss: 1.4 }, { n: 8, ss: 1.45 },
]

// 1) speed-corrected VO
const voDur = []
for (let i = 1; i <= 10; i++) {
  sh(`ffmpeg -y -i ${A}/t${i}.mp3 -filter:a atempo=${TEMPO} -ar 44100 ${A}/s${i}.mp3`)
  voDur[i] = dur(`${A}/s${i}.mp3`)
}

// 2) normalise each beat to 9:16 / 30fps, length = VO + breath
const segs = []
for (const b of BEATS) {
  const d = Math.max(2.4, +(voDur[b.n] + GAP).toFixed(2))
  sh(`ffmpeg -y -ss ${b.ss} -t ${d} -i ${T}/clip-beat${b.n}.mp4 -vf 'crop=992:1764,scale=1080:1920,setsar=1' ${ENC} ${G}/s${b.n}.mp4`)
  const actual = dur(`${G}/s${b.n}.mp4`)
  if (Math.abs(actual - d) > 0.08) console.warn(`  beat ${b.n}: asked ${d}s, got ${actual.toFixed(2)}s`)
  segs.push({ f: `${G}/s${b.n}.mp4`, d: actual })
}
sh(`ffmpeg -y -i ${T}/beat9-montage.mp4 -vf 'scale=1080:1920,setsar=1' ${ENC} ${G}/s9.mp4`)
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

// 4) video = story + finale
sh(`cd ${G} && rm -f l.txt && echo "file 'story.mp4'" >> l.txt && echo "file '../beat10-finale.mp4'" >> l.txt`)
sh(`ffmpeg -y -f concat -safe 0 -i ${G}/l.txt -c copy ${G}/video.mp4`)
const total = dur(`${G}/video.mp4`)
const finaleStart = storyDur

// 5) audio: VO on the beats, vo9 on the montage, vo10 landing on the loop-close + end card
const voAt = starts.map((s) => +(s + 0.12).toFixed(2))
const vo10At = +(finaleStart + 3.1).toFixed(2)
const beats = ['music', 'hb1', 'hb2', ...segs.map((_, i) => `vo${i + 1}`), 'vo10']
let af = `[0:a]volume=0.34,afade=t=in:st=0:d=1.2,afade=t=out:st=${(total - 2).toFixed(2)}:d=2[mus];`
af += `[1:a]adelay=200|200,volume=0.5[hb1];`
af += `[2:a]adelay=${Math.round((finaleStart + 5.6) * 1000)}|${Math.round((finaleStart + 5.6) * 1000)},volume=0.45[hb2];`
segs.forEach((_, i) => {
  const ms = Math.round(voAt[i] * 1000)
  af += `[${i + 3}:a]adelay=${ms}|${ms},volume=1.35[vo${i + 1}];`
})
af += `[${segs.length + 3}:a]adelay=${Math.round(vo10At * 1000)}|${Math.round(vo10At * 1000)},volume=1.35[vo10];`
af += `[mus][hb1][hb2]${segs.map((_, i) => `[vo${i + 1}]`).join('')}[vo10]amix=inputs=${segs.length + 4}:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,aresample=44100[aout]`
const ins = [`-i ${A}/music36.mp3`, `-i ${A}/heartbeat.mp3`, `-i ${A}/heartbeat.mp3`,
  ...segs.map((_, i) => `-i ${A}/s${i + 1}.mp3`), `-i ${A}/s10.mp3`].join(' ')
sh(`ffmpeg -y ${ins} -filter_complex '${af}' -map '[aout]' -t ${total.toFixed(2)} -c:a aac -b:a 192k ${G}/mix.m4a`)

// 6) mux
sh(`ffmpeg -y -i ${G}/video.mp4 -i ${G}/mix.m4a -map 0:v -map 1:a -c:v copy -c:a copy -movflags +faststart ${T}/trailer-master.mp4`)
console.log('beat lengths:', segs.map((s) => s.d).join(' '))
console.log('vo starts:', voAt.join(' '), '| vo10 @', vo10At)
console.log('story:', storyDur.toFixed(2), 'finale starts:', finaleStart.toFixed(2), 'TOTAL:', total.toFixed(2))
