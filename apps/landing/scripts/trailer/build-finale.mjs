// Beat 10 — the finale. Cut 3 makes the brand the conclusion of the story rather than a card at the
// end: imagination -> creation -> Kendrix.
//
//   f1   the montage freezes
//   f2   a pan across the real storyboard editor, landing on the Render-reel CTA
//   f3   the cursor reaches the CTA, then the press flash
//   f4   CREATION: the product's own "Rolling your reel" state, pushing in
//   f5   the payoff: the finished pipeline reel
//   f6   the camera pulls back off the reel into somewhere UNREADABLE, and only in the last third
//        does the room rack into focus — you realise you are inside Kendrix, at Approve reel
//   f7   the room dims to near-black; the CTA's gradient is the only light left        (CSS)
//   f8   that gradient contracts and resolves into the Kendrix K                        (CSS)
//   f9   the wordmark sets beside it, beat 1's room rises behind, the tagline lands     (CSS)
//
// Free to re-run: no API calls, only ffmpeg and a headless browser over assets already on disk.
//
// Every crop window is DERIVED from ui-geometry.json (written by shoot-ui-states.mjs), never
// hard-coded: the 2026-08-06 dock redesign moved the Render CTA 56px left and 20px down, and a
// hard-coded cursor would have pressed empty dock. The same rule now carries the pull-back's
// destination and the gradient the K grows out of.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { CLIPS, UI, WORK, REEL_SOURCE, ensureDirs } from './paths.mjs'
import { renderMotionShots, SHOTS as CSS_SHOTS } from './shoot-motion.mjs'

ensureDirs()
const F = `${WORK}/finale`
mkdirSync(F, { recursive: true })

const sh = (c) => {
  try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) {
    console.error('FAILED:', c.slice(0, 260))
    console.error(String(e.stderr).split('\n').slice(-5).join('\n'))
    throw new Error('stop')
  }
}
const ENC = '-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -an'
const dur = (f) => Number(sh(`ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 ${f}`).toString().trim())
const FPS = 30

// ── geometry ───────────────────────────────────────────────────────────────────────────────────
const GEO = `${UI}/ui-geometry.json`
if (!existsSync(GEO)) throw new Error(`no ${GEO} — run shoot-ui-states.mjs first`)
const geo = JSON.parse(readFileSync(GEO, 'utf8'))
const { dsf } = geo.storyboard.viewport
const MW = geo.storyboard.viewport.w * dsf, MH = geo.storyboard.viewport.h * dsf // master px
const CROP_W = Math.round((MH * 9) / 16), CROP_H = MH // a full-height 9:16 window
const SCALE = 1080 / CROP_W
const master = (r) => ({ x: r.x * dsf, y: r.y * dsf, w: r.w * dsf, h: r.h * dsf })
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const windowAt = (cx) => Math.round(Math.min(Math.max(cx - CROP_W / 2, 0), MW - CROP_W))
const inWindow = (r, x0) => !!r && (r.x + r.w) * dsf > x0 && r.x * dsf < x0 + CROP_W

const cta = geo.storyboard.renderCta
if (!cta) throw new Error('ui-geometry.json has no renderCta — the storyboard shot missed the dock')
const ctaC = centre(master(cta))
const PAN_TO = windowAt(ctaC.x)
// Where the pan OPENS is a craft choice, not a measurement: it starts on the work (the frame and the
// script beside it) so the move reads as workbench -> finished reel -> the button that makes it.
const PAN_FROM = 1050
if (!inWindow(geo.storyboard.frame, PAN_FROM) && !inWindow(geo.storyboard.strip, PAN_FROM)) {
  console.warn(`  pan opens at ${PAN_FROM} with neither the frame nor the strip in it — check the shot`)
}
const CUR = { x: Math.round((ctaC.x - PAN_TO) * SCALE), y: Math.round(ctaC.y * SCALE) }
const TRAVEL = { x: 410, y: 526 }
const card = geo.rendering.renderingCard
const PUSH_AT = card ? windowAt(centre(master(card)).x) : Math.round((MW - CROP_W) / 2)

// The pull-back: from the reel filling the frame, out to the reel sitting in its panel.
const reel = geo.spot_check.reelPreview
const approve = geo.spot_check.approveReel
if (!reel || !approve) throw new Error('spot_check is missing reelPreview / approveReel — re-run shoot-ui-states.mjs')
const rm = master(reel)
// The <video> box is a touch wider than 9:16; the picture inside fits by height.
const REEL_W = Math.round((rm.h * 9) / 16)
const REEL_BOX = { x: Math.round(rm.x + (rm.w - REEL_W) / 2), y: Math.round(rm.y), w: REEL_W, h: Math.round(rm.h) }
// The window the move lands in must hold both the reel panel and the CTA the realisation pays off on.
const LAND_AT = MW - CROP_W
const am = master(approve)
if (am.x < LAND_AT) throw new Error(`Approve reel (x=${am.x}) falls outside the landing window (x>=${LAND_AT})`)
// The Approve-reel rect inside the landed 1080x1920 frame — this is what f7/f8 grow the K out of.
const SEED = {
  x: Math.round((am.x - LAND_AT) * SCALE),
  y: Math.round(am.y * SCALE),
  w: Math.round(am.w * SCALE),
  h: Math.round(am.h * SCALE),
}
writeFileSync(`${F}/seed-rect.json`, JSON.stringify(SEED))

console.log(`master ${MW}x${MH} · window ${CROP_W}x${CROP_H} @ ${SCALE.toFixed(3)}`)
console.log(`pan ${PAN_FROM}->${PAN_TO} · cursor ${CUR.x},${CUR.y} · push-in ${PUSH_AT}`)
console.log(`pull-back: reel box ${JSON.stringify(REEL_BOX)} -> window x=${LAND_AT} · seed ${JSON.stringify(SEED)}`)

const PAN = (img, out, t, x0, x1) =>
  sh(`ffmpeg -y -loop 1 -i ${img} -t ${t} -vf 'crop=${CROP_W}:${CROP_H}:${x0}+${x1 - x0}*t/${t}:0,scale=1080:1920,setsar=1' ${ENC} ${out}`)
const PUSH = (img, out, frames, z, pre) =>
  sh(`ffmpeg -y -i ${img} -vf '${pre},zoompan=z=1+${z}*on/${frames}:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=${frames}:s=1080x1920:fps=30,setsar=1' ${ENC} ${out}`)

// ── f1–f5: unchanged from cut 2 ─────────────────────────────────────────────────────────────────
sh(`ffmpeg -y -sseof -0.05 -i ${CLIPS}/beat9-montage.mp4 -frames:v 1 ${F}/freeze.png`)
if (statSync(`${F}/freeze.png`).size < 1000) throw new Error('freeze frame empty')
sh(`ffmpeg -y -loop 1 -i ${F}/freeze.png -t 0.5 -vf 'scale=1080:1920,setsar=1' ${ENC} ${F}/f1.mp4`)
PAN(`${UI}/ui-render-cta.png`, `${F}/f2.mp4`, 1.3, PAN_FROM, PAN_TO)
const LAND = `crop=${CROP_W}:${CROP_H}:${PAN_TO}:0,scale=1080:1920,setsar=1`
sh(`ffmpeg -y -loop 1 -i ${UI}/ui-render-cta.png -loop 1 -i ${UI}/cursor.png -t 0.6 -filter_complex '[0:v]${LAND}[bg];[bg][1:v]overlay=x=${CUR.x - TRAVEL.x}+${TRAVEL.x}*t/0.6:y=${CUR.y - TRAVEL.y}+${TRAVEL.y}*t/0.6' ${ENC} ${F}/f3a.mp4`)
sh(`ffmpeg -y -loop 1 -i ${UI}/ui-render-cta.png -loop 1 -i ${UI}/cursor.png -t 0.12 -filter_complex '[0:v]${LAND},drawbox=x=0:y=0:w=1080:h=1920:color=white@0.3:t=fill[bg];[bg][1:v]overlay=x=${CUR.x}:y=${CUR.y}' ${ENC} ${F}/f3b.mp4`)
PUSH(`${UI}/ui-rendering.png`, `${F}/f4.mp4`, 39, 0.06, `crop=${CROP_W}:${CROP_H}:${PUSH_AT}:0,scale=1080:1920`)
sh(`ffmpeg -y -ss 38.4 -t 1.4 -i ${REEL_SOURCE} -vf 'scale=1080:1920,setsar=1' ${ENC} ${F}/f5.mp4`)

// ── f6: the pull-back, as a discovery ───────────────────────────────────────────────────────────
// A plain zoom-out fails: the light header, the sidebar and the filmstrip enter frame progressively
// and read as "a UI" within a few frames, so the audience is TOLD rather than allowed to notice. The
// surround is therefore illegible for the first two thirds and racks into focus in the last — the
// reel is composited AFTER the blur in both passes, so the thing you were watching never softens.
//
// Two renders and a crossfade rather than one animated filter, because gblur's sigma is not an
// expression parameter in ffmpeg. Worth knowing before someone tries to "simplify" this.
const F6 = 1.7
const N6 = Math.round(F6 * FPS) - 1
const U = `(on/${N6})`
const P = `(${U}*${U}*(3-2*${U}))`            // ease-in-out, comma-free so it survives the filtergraph
const Z0 = CROP_W / REEL_BOX.w                 // start zoom: the reel fills the frame
const CX0 = REEL_BOX.x + REEL_BOX.w / 2 - LAND_AT, CY0 = REEL_BOX.y + REEL_BOX.h / 2
const CX1 = CROP_W / 2, CY1 = CROP_H / 2
// No inner quotes and no commas in these expressions on purpose: the filtergraph sits inside a
// single-quoted shell string, so a nested quote would end it early, and a comma would read as the
// next filter. That is why the easing is written as arithmetic rather than pow(x,y).
const term = (a, b) => `(${a.toFixed(1)}${b - a < 0 ? '-' : '+'}${Math.abs(b - a).toFixed(1)}*${P})`
const move = `zoompan=z=${Z0.toFixed(4)}-${(Z0 - 1).toFixed(4)}*${P}:x=${term(CX0, CX1)}-(iw/zoom/2):y=${term(CY0, CY1)}-(ih/zoom/2):d=1:s=1080x1920:fps=${FPS}`
const reelIn = `-ss 39.8 -t ${F6} -i ${REEL_SOURCE}`
const place = `scale=${REEL_BOX.w}:${REEL_BOX.h}`
// soft: the room UNREADABLE — but not black. The first attempt darkened it to nothing, which reads as
// "a shrinking reel in a void" rather than "wait, where am I?". Bloom the light instead of killing it:
// heavy blur, saturation kept, brightness lifted slightly, only a gentle vignette. You can tell you
// are somewhere; you cannot tell where.
const soft = `[0:v]gblur=sigma=62,eq=brightness=0.04:saturation=0.55,vignette=a=0.30[bg]`
const clean = `[0:v]null[bg]`
for (const [tag, pre] of [['soft', soft], ['clean', clean]]) {
  // -framerate 30 on the still matters: a looped image defaults to 25fps, which would leave zoompan's
  // `on` counter short of N6 and the move would stop before it landed.
  sh(`ffmpeg -y -loop 1 -framerate ${FPS} -i ${UI}/ui-spotcheck.png ${reelIn} -filter_complex '${pre};[1:v]${place}[r];[bg][r]overlay=x=${REEL_BOX.x}:y=${REEL_BOX.y}:shortest=1[c];[c]crop=${CROP_W}:${CROP_H}:${LAND_AT}:0,fps=${FPS},${move},setsar=1[v]' -map '[v]' -t ${F6} ${ENC} ${F}/f6-${tag}.mp4`)
}
// The rack: hold the unreadable room, then resolve it in the final third. The room is fully legible
// only from 1.45s — and f7's dim ramp keeps it readable a moment longer, so "Approve reel" gets about
// half a second on screen before the light goes out. Any earlier and the reveal leaks.
const RACK_AT = 1.1
sh(`ffmpeg -y -i ${F}/f6-soft.mp4 -ss ${RACK_AT} -i ${F}/f6-clean.mp4 -filter_complex '[0:v][1:v]xfade=transition=fade:duration=0.35:offset=${RACK_AT}' ${ENC} ${F}/f6.mp4`)
// The last frame is the background f7 dims — so the dim starts from exactly where the pull-back left off.
sh(`ffmpeg -y -sseof -0.04 -i ${F}/f6.mp4 -frames:v 1 -update 1 ${F}/f6-last.png`)
if (statSync(`${F}/f6-last.png`).size < 1000) throw new Error('f6 last frame empty')

// ── f7 / f8 / f9: the CSS shots ─────────────────────────────────────────────────────────────────
console.log('rendering the CSS shots…')
await renderMotionShots({ bg: `${F}/f6-last.png`, seed: SEED })
for (const n of ['f7', 'f8', 'f9']) sh(`cp ${CLIPS}/beat10-${n}.mp4 ${F}/${n}.mp4`)

// ── the finale, and its timeline as data ────────────────────────────────────────────────────────
// vo10At used to be `finaleStart + 3.1`, a magic number. For this ending the VISUAL anchors the
// voice: "Kendrix." must land on the frame where the K resolves. So the shot boundaries become data
// the audio pass reads, and nobody has to redo arithmetic when a shot length changes.
const parts = ['f1', 'f2', 'f3a', 'f3b', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9']
writeFileSync(`${F}/list.txt`, parts.map((p) => `file '${F}/${p}.mp4'`).join('\n') + '\n')
sh(`ffmpeg -y -f concat -safe 0 -i ${F}/list.txt -c copy ${CLIPS}/beat10-finale.mp4`)

let at = 0
const shots = []
for (const p of parts) {
  const d = dur(`${F}/${p}.mp4`)
  shots.push({ name: p, at: +at.toFixed(4), duration: +d.toFixed(4) })
  at += d
}
const kResolvesAt = shots.find((s) => s.name === 'f8').at + shots.find((s) => s.name === 'f8').duration
const manifest = {
  builtFor: 'cut 3',
  total: +at.toFixed(4),
  shots,
  // Named markers the audio pass anchors to (finale-relative seconds).
  markers: { kResolvesAt: +kResolvesAt.toFixed(4), lockupAt: +shots.find((s) => s.name === 'f9').at.toFixed(4) },
  cssShotLengths: CSS_SHOTS,
}
writeFileSync(`${CLIPS}/beat10-shots.json`, JSON.stringify(manifest, null, 2))

for (const s of shots) console.log(`${s.name.padEnd(4)} ${s.at.toFixed(2)}s +${s.duration.toFixed(2)}s`)
console.log(`beat10-finale: ${manifest.total.toFixed(2)}s · K resolves at +${manifest.markers.kResolvesAt.toFixed(2)}s`)
console.log(`manifest -> ${CLIPS}/beat10-shots.json`)
