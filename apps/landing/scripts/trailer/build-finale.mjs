import { execSync } from 'node:child_process'
import { mkdirSync, statSync } from 'node:fs'
const S = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad'
const T = `${S}/trailer`, F = `${T}/finale`
mkdirSync(F, { recursive: true })
const sh = (c) => {
  try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) { console.error('FAILED:', c.replace(S, '…')); console.error(String(e.stderr).split('\n').slice(-5).join('\n')); throw new Error('stop') }
}
const ENC = '-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -an'
const PAN = (img, out, t, x0, x1) =>
  sh(`ffmpeg -y -loop 1 -i ${img} -t ${t} -vf 'crop=1125:2000:${x0}+${x1 - x0}*t/${t}:0,scale=1080:1920,setsar=1' ${ENC} ${out}`)
// zoompan push-in on a still: constant frame size, varying zoom (crop size can't vary per frame)
const PUSH = (img, out, frames, z, pre) =>
  sh(`ffmpeg -y -i ${img} -vf '${pre},zoompan=z=1+${z}*on/${frames}:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=${frames}:s=1080x1920:fps=30,setsar=1' ${ENC} ${out}`)

// F1 — the freeze (decode-accurate seek so the frame definitely lands)
sh(`ffmpeg -y -sseof -0.05 -i ${T}/beat9-montage.mp4 -frames:v 1 ${F}/freeze.png`)
if (statSync(`${F}/freeze.png`).size < 1000) throw new Error('freeze frame empty')
sh(`ffmpeg -y -loop 1 -i ${F}/freeze.png -t 0.5 -vf 'scale=1080:1920,setsar=1' ${ENC} ${F}/f1.mp4`)

// F2 — the reveal pan across the REAL storyboard editor, landing on the Render CTA
PAN(`${T}/ui-render-cta.png`, `${F}/f2.mp4`, 1.3, 1050, 2075)

// F3a/b — the cursor reaches the gradient "Render reel" CTA, then the press flash
sh(`ffmpeg -y -loop 1 -i ${T}/ui-render-cta.png -loop 1 -i ${T}/cursor.png -t 0.6 -filter_complex '[0:v]crop=1125:2000:2075:0,scale=1080:1920,setsar=1[bg];[bg][1:v]overlay=x=450+410*t/0.6:y=1300+526*t/0.6' ${ENC} ${F}/f3a.mp4`)
sh(`ffmpeg -y -loop 1 -i ${T}/ui-render-cta.png -loop 1 -i ${T}/cursor.png -t 0.12 -filter_complex '[0:v]crop=1125:2000:2075:0,scale=1080:1920,setsar=1,drawbox=x=0:y=0:w=1080:h=1920:color=white@0.3:t=fill[bg];[bg][1:v]overlay=x=860:y=1826' ${ENC} ${F}/f3b.mp4`)

// F4 — CREATION: the product's real rendering state, slow push in (45f = 1.5s)
PUSH(`${T}/ui-rendering.png`, `${F}/f4.mp4`, 39, 0.06, 'crop=1125:2000:1038:0,scale=1080:1920')

// F5 — the payoff: the finished pipeline reel
sh(`ffmpeg -y -ss 38.4 -t 1.4 -i ${S}/whatif-reel.mp4 -vf 'scale=1080:1920,setsar=1' ${ENC} ${F}/f5.mp4`)

// F6 — the loop closes: push into the reel, dissolve to the beat-1 bedroom
sh(`ffmpeg -y -ss 40.0 -t 0.8 -i ${S}/whatif-reel.mp4 -vf 'zoompan=z=1+0.28*on/24:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=1:s=1080x1920:fps=30,setsar=1' ${ENC} ${F}/f6a.mp4`)
sh(`ffmpeg -y -ss 0.2 -t 0.7 -i ${T}/clip-beat1.mp4 -vf 'crop=992:1764,scale=1080:1920,setsar=1' ${ENC} ${F}/f6b.mp4`)
sh(`ffmpeg -y -i ${F}/f6a.mp4 -i ${F}/f6b.mp4 -filter_complex '[0:v][1:v]xfade=transition=fade:duration=0.35:offset=0.45' ${ENC} ${F}/f6.mp4`)

// F7 — end card up from black
sh(`ffmpeg -y -loop 1 -i ${T}/endcard.png -t 1.7 -vf 'scale=1080:1920,setsar=1,fade=t=in:st=0:d=0.5' ${ENC} ${F}/f7.mp4`)

const parts = ['f1', 'f2', 'f3a', 'f3b', 'f4', 'f5', 'f6', 'f7']
sh(`cd ${F} && rm -f list.txt && ${parts.map((p) => `echo "file '${p}.mp4'" >> list.txt`).join(' && ')}`)
sh(`ffmpeg -y -f concat -safe 0 -i ${F}/list.txt -c copy ${T}/beat10-finale.mp4`)
for (const p of [...parts, '../beat10-finale']) {
  const d = sh(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 ${F}/${p}.mp4`).toString().trim()
  console.log(`${p}: ${Number(d).toFixed(2)}s`)
}
