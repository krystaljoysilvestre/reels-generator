// The finale's motion-graphics shots, rendered as CSS in a headless browser and captured frame by
// frame. $0, re-runnable, and — the point — the end card inherits the PRODUCT'S OWN motion language:
// .stage-leak, .film-grain and the gl-float / gl-twinkle / gl-aura keyframes are copied verbatim from
// apps/web/src/app/globals.css. The card doesn't imitate Kendrix; it moves like it.
//
//   f7  the room dims to near-black; the Approve-reel gradient is the only light left
//   f8  that gradient contracts and resolves into the Kendrix K
//   f9  the wordmark sets beside it, the room from beat 1 rises behind, the tagline lands
//
// TIME IS DETERMINISTIC. Nothing is captured in real time: ambient layers are the app's keyframes
// held at `animation-play-state: paused` with a negative `animation-delay`, and the dramatic timeline
// is an explicit interpolation evaluated per frame. Frame n is a pure function of t, so a re-run is
// identical — which is what makes "re-render the ending" a safe operation rather than a gamble.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { CLIPS, STILLS, WORK, REPO, ensureDirs } from './paths.mjs'
import { launch } from './cdp.mjs'
import { ANAPHORA, CAPTIONED_BEATS, EMPHASIS, LINES } from './narration.mjs'

export const FPS = 30
// Shot lengths (seconds). f7+f8 are one continuous 1.35s render split into two clips, so the
// finale's timeline stays legible and `kResolvesAt` falls exactly on f8's last frame.
export const SHOTS = { f7: 0.6, f8: 0.75, f9: 4.7 }

const b64 = (p) => readFileSync(p).toString('base64')
const dataUri = (p) => `data:${p.endsWith('.png') ? 'image/png' : 'image/jpeg'};base64,${b64(p)}`

// The real fonts the app ships (next/font subsets), inlined — no network, no silent fallback.
//
// Selection is by UNICODE COVERAGE, never by filename. The first version excluded `.p.` (preload)
// files and took the first remaining woff2 — which is the CYRILLIC subset: next/font lists the
// non-latin subsets first and preloads exactly the latin one. Every glyph of "Kendrix" silently fell
// back to the system sans, and it took the founder's eye to catch it ("the font family is still the
// same"). A latin subset must cover U+0000-00FF; anything else is the wrong file.
function fontFromCss(family) {
  const dir = `${REPO}/apps/landing/.next/static/media`
  const cssPath = `${REPO}/apps/landing/.next/static/css/app/layout.css`
  if (!existsSync(cssPath)) throw new Error(`no built font cache at ${cssPath} — run the landing app once`)
  const css = readFileSync(cssPath, 'utf8')
  const block = css.split('@font-face').find(
    (b) => new RegExp(`font-family:\\s*'?${family}`).test(b) && /woff2/.test(b) && /U\+0000-00FF/.test(b),
  )
  const file = block?.match(/media\/([\w.-]+\.woff2)/)?.[1]
  if (!file) throw new Error(`no latin-subset woff2 for ${family} in the built CSS`)
  return b64(`${dir}/${file}`)
}
const nunito = () => fontFromCss('Nunito')

// ── the shared world: exactly the app's cutting-room motif ──────────────────────────────────────
const WORLD = (font) => `
  @font-face { font-family: 'Nunito'; src: url(data:font/woff2;base64,${font}) format('woff2');
    font-weight: 400 900; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; background: #07060C; }
  .stage { position: absolute; inset: 0; overflow: hidden; background: #1B1330; }
  /* verbatim from globals.css .stage-leak + tailwind's leak keyframe */
  .stage-leak {
    position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(600px 380px at 82% -8%, rgba(255, 45, 155, 0.34), transparent 65%),
      radial-gradient(560px 420px at 6% 108%, rgba(47, 164, 255, 0.28), transparent 62%),
      radial-gradient(500px 400px at 55% 55%, rgba(155, 59, 255, 0.16), transparent 70%);
    animation: leak 7s ease-in-out infinite;
  }
  @keyframes leak {
    0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.85; }
    50% { transform: translate(-12px, 8px) scale(1.07); opacity: 1; }
  }
  /* verbatim from globals.css .film-grain */
  .film-grain {
    position: absolute; inset: 0; pointer-events: none;
    opacity: 0.09; mix-blend-mode: soft-light;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
  }
  .vignette { position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(circle at 50% 46%, transparent 42%, rgba(0,0,0,0.62) 100%); }
  /* verbatim from globals.css */
  @keyframes gl-aura { 0%, 100% { transform: scale(0.82); opacity: 0.14; } 50% { transform: scale(1.2); opacity: 0.34; } }
  @keyframes gl-float { 0%, 100% { transform: translateY(6%) rotate(-3deg); } 50% { transform: translateY(-8%) rotate(3deg); } }
  @keyframes gl-twinkle { 0%, 100% { transform: rotate(0deg) scale(0.9); opacity: 0.85; } 50% { transform: rotate(45deg) scale(1.12); opacity: 1; } }
  .anim { animation-play-state: paused !important; animation-fill-mode: both; }
`

// ── f7 + f8: the room dims, the gradient survives, the gradient becomes the K ───────────────────
// `seed` is the Approve-reel button's rect inside the 1080x1920 frame the pull-back lands on —
// measured, passed in, never guessed. The surviving light uses the app's own BRAND_3 gradient.
const dimHtml = (font, bg, seed, kMark) => `<style>${WORLD(font)}
  #bg { position: absolute; inset: 0; background: #000 url(${bg}) center/cover no-repeat; }
  #veil { position: absolute; inset: 0; background: #06050B; opacity: 0; }
  #seed { position: absolute; border-radius: 8px;
    background: linear-gradient(120deg, #2FA4FF 0%, #9B3BFF 45%, #FF2D9B 100%); }
  #glow { position: absolute; border-radius: 50%; filter: blur(46px); opacity: 0;
    background: radial-gradient(circle, rgba(155,59,255,0.85), rgba(255,45,155,0.25) 55%, transparent 72%); }
  #k { position: absolute; left: 540px; top: 845px; translate: -50% -50%; width: 300px; opacity: 0; }
</style>
<div class="stage" style="background:#000">
  <div id="bg"></div>
  <div id="veil"></div>
  <div id="glow"></div>
  <div id="seed"></div>
  <img id="k" src="${kMark}">
  <div class="film-grain"></div>
</div>
<script>
  var S = ${JSON.stringify(seed)};
  var E = function (a, b, p) { return a + (b - a) * p };
  var c01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v };
  var sm = function (p) { p = c01(p); return p * p * (3 - 2 * p) };
  var CX = 540, CY = 845;
  window.renderAt = function (t) {
    // Phase A (0 -> 0.60): the room goes out. The seed does not.
    var dim = sm(t / 0.6);
    document.getElementById('veil').style.opacity = String(dim);
    document.getElementById('bg').style.filter =
      'saturate(' + E(1, 0.15, dim).toFixed(3) + ') brightness(' + E(1, 0.25, dim).toFixed(3) + ')';

    // Phase B (0.60 -> 1.35): the light contracts to centre and becomes the mark.
    var p = sm((t - 0.6) / 0.75);
    var w = E(S.w, 132, p), h = E(S.h, 132, p);
    var x = E(S.x + S.w / 2, CX, p), y = E(S.y + S.h / 2, CY, p);
    var seed = document.getElementById('seed');
    seed.style.width = w + 'px';
    seed.style.height = h + 'px';
    seed.style.left = (x - w / 2) + 'px';
    seed.style.top = (y - h / 2) + 'px';
    seed.style.borderRadius = E(8, 66, p) + 'px';
    seed.style.filter = 'blur(' + E(0, 26, p).toFixed(2) + 'px)';
    seed.style.opacity = String(1 - sm((p - 0.55) / 0.45) * 0.9);

    var glow = document.getElementById('glow'), gs = E(120, 620, p);
    glow.style.width = gs + 'px';
    glow.style.height = gs + 'px';
    glow.style.left = (x - gs / 2) + 'px';
    glow.style.top = (y - gs / 2) + 'px';
    glow.style.opacity = String(E(0, 0.9, sm(p / 0.7)));

    // The mark resolves out of the light in the last third, with a touch of overshoot.
    var kp = sm((p - 0.55) / 0.45), k = document.getElementById('k');
    k.style.opacity = String(kp);
    k.style.scale = String(E(0.62, 1, kp) * (1 + 0.06 * Math.sin(Math.PI * kp)));
  };
</script>`

// ── f9: the lockup, the room from beat 1, the tagline ───────────────────────────────────────────
const cardHtml = (font, room, kMark) => `<style>${WORLD(font)}
  #room { position: absolute; inset: -6%; background: #000 url(${room}) center/cover no-repeat; opacity: 0; }
  #lock { position: absolute; left: 540px; top: 845px; translate: -50% -50%;
    display: flex; align-items: center; gap: 30px; }
  #k { width: 300px; }
  /* Matched to the landing header's wordmark — Nunito 900 at -0.02em (chrome.tsx:19). It was set at
     -0.035em, which read tighter than the header it has to sit under. */
  #word { font-family: 'Nunito', sans-serif; font-weight: 900; font-size: 168px;
    letter-spacing: -0.02em; color: #F4F1F7; white-space: nowrap; opacity: 0; }
  #aura { position: absolute; left: 540px; top: 845px; translate: -50% -50%;
    width: 900px; height: 900px; border-radius: 50%; pointer-events: none;
    background: radial-gradient(circle, rgba(155,59,255,0.30), transparent 62%);
    animation: gl-aura 9s ease-in-out infinite; }
  /* No translate property here on purpose: renderAt sets transform translate(-50%, N), and the two
     compose — having both centred the line twice and clipped "Every" off the left edge. */
  /* Same family and tracking as the header; weight 800 because it is a sentence, not a wordmark —
     which is the same call the app's own Wordmark component makes. */
  #tag { position: absolute; left: 50%; bottom: 20%; transform: translate(-50%, 14px);
    font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 62px;
    letter-spacing: -0.02em; color: #F4F1F7; opacity: 0; white-space: nowrap; }
  .mote { position: absolute; border-radius: 50%; background: #FFE9C7;
    box-shadow: 0 0 12px 3px rgba(255,214,150,0.55); animation: gl-float 11s ease-in-out infinite; }
  .spark { position: absolute; background: #fff;
    clip-path: polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%);
    animation: gl-twinkle 6s ease-in-out infinite; }
  #fade { position: absolute; inset: 0; background: #07060C; opacity: 0; }
</style>
<div class="stage">
  <div id="room"></div>
  <div class="stage-leak anim"></div>
  <div id="aura" class="anim"></div>
  <div id="motes"></div>
  <div id="lock"><img id="k" src="${kMark}"><div id="word">Kendrix</div></div>
  <div id="tag">Every Story Begins Here.</div>
  <div class="vignette"></div>
  <div class="film-grain"></div>
  <div id="fade"></div>
</div>
<script>
  // Drifting particles on the app's gl-float / gl-twinkle, seeded deterministically (no Math.random,
  // so every re-render is identical).
  var box = document.getElementById('motes'), seed = 20260806;
  var rnd = function () { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff };
  for (var i = 0; i < 26; i++) {
    var d = document.createElement('div'), spark = i % 5 === 0;
    d.className = (spark ? 'spark' : 'mote') + ' anim';
    var s = spark ? 12 : 3 + rnd() * 5;
    d.style.width = s + 'px'; d.style.height = s + 'px';
    d.style.left = (6 + rnd() * 88) + '%';
    d.style.top = (10 + rnd() * 78) + '%';
    d.style.opacity = String(0.25 + rnd() * 0.5);
    d.style.animationDuration = (7 + rnd() * 9).toFixed(2) + 's';
    d.dataset.phase = (rnd() * 12).toFixed(2);
    box.appendChild(d);
  }

  var E = function (a, b, p) { return a + (b - a) * p };
  var c01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v };
  var sm = function (p) { p = c01(p); return p * p * (3 - 2 * p) };
  window.renderAt = function (t) {
    // 0.00-0.65 the mark holds alone, as it resolved | 0.65-1.05 the wordmark sets beside it
    // 1.05-2.75 the room from beat 1 rises behind    | 2.90-3.60 the tagline resolves
    // 4.20-4.70 everything eases out
    var wp = sm((t - 0.65) / 0.4), word = document.getElementById('word');
    word.style.opacity = String(wp);
    word.style.transform = 'translateX(' + E(-34, 0, wp).toFixed(2) + 'px)';

    var rp = sm((t - 1.05) / 1.7), room = document.getElementById('room');
    room.style.opacity = String(E(0, 0.2, rp));
    room.style.scale = String(E(1.0, 1.07, c01(t / 4.7)));

    var tp = sm((t - 2.9) / 0.7), tag = document.getElementById('tag');
    tag.style.opacity = String(tp);
    tag.style.transform = 'translate(-50%, ' + E(14, 0, tp).toFixed(2) + 'px)';

    document.getElementById('fade').style.opacity = String(sm((t - 4.2) / 0.5));
  };
</script>`

// ── captions: titles, not subtitles ────────────────────────────────────────────────────────────
// The first version set these in the product's own `cinematic` preset — faithful, and far too plain
// for a brand film (founder: "isn't fancy and artsy at all"). So the preset constraint is dropped and
// the type is built from the FILM's own grammar instead:
//
//   · no bar. A translucent grey box is the single most "utility subtitle" element there is. Legibility
//     comes from a soft graduated scrim and a real shadow, the way film titles do it.
//   · Nunito — the brand's display face, the same one the wordmark and the landing header use — set
//     large enough to read as a title.
//   · words arrive ON LIGHT: each one blooms out of a blur and drifts up, staggered. Light drives every
//     transition in this cut (fadewhite between beats, the leak, the collapse), so type should enter
//     the same way rather than pop.
//   · ONE word per line wears the BRAND GRADIENT. That gradient then runs through all nine lines and,
//     at 36s, contracts and becomes the K — so the logo is the payoff of a thread the viewer has been
//     reading for thirty seconds. That is the whole idea; the rest is execution.
const CAP = {
  size: 78,          // Nunito 800 — a title, not a caption
  stemSize: 70,      // the held "What if" — the sentence's own first line, not a label
  bottom: 300,       // higher than a subtitle band; still clear of every beat's focal point
  maxWidth: 900,
  zone: 380,        // the caption zone's fixed height — stem row + up to two clause lines
  stagger: 0.07,     // seconds between word entrances
  wordIn: 0.34,      // each word's own entrance
  out: 0.28,         // the light going back out
}
// The brand gradient, LIFTED for type on dark. The literal brand stops made the emphasised word
// *dimmer* than the white ones — a short word samples only the deep blue-purple slice of a
// background-clip gradient, so the highlight read as de-emphasis. These are the same hues at a
// luminance that reads as light.
const BRAND = 'linear-gradient(100deg, #7FD3FF 0%, #C79BFF 34%, #FF8AC8 68%, #FFC98A 100%)'

// Splits a line into words, marking the run that carries the gradient. `emph` may be a phrase.
function markWords(text, emph) {
  const i = emph ? text.toLowerCase().indexOf(emph.toLowerCase()) : -1
  if (i < 0) return text.split(/\s+/).map((w) => ({ w, hot: false }))
  const before = text.slice(0, i).trim()
  // Trailing punctuation rides WITH the emphasised word — split apart it rendered as "question ."
  const m = text.slice(i).match(new RegExp(`^${emph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s]*([.,!?;:]+)?`, 'i'))
  const hot = emph + (m?.[1] ?? '')
  const after = text.slice(i + (m?.[0]?.length ?? emph.length)).trim()
  return [
    ...(before ? before.split(/\s+/).map((w) => ({ w, hot: false })) : []),
    ...hot.split(/\s+/).map((w) => ({ w, hot: true })),
    ...(after ? after.split(/\s+/).map((w) => ({ w, hot: false })) : []),
  ]
}

const captionHtml = (font, cue) => {
  const words = cue.mode === 'stem' ? [] : markWords(cue.clause ?? cue.text, cue.emph)
  const anaphora = cue.mode === 'stem' || cue.mode === 'clause'
  const stemLit = cue.mode === 'stem' // only the stem layer PAINTS it; the clause layer reserves its box
  return `<style>
  @font-face { font-family: 'Nunito'; src: url(data:font/woff2;base64,${font}) format('woff2');
    font-weight: 400 900; font-display: block; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; background: transparent; }
  /* A graduated wash, not a box — it holds the type legible over bright frames and dies out upward. */
  #scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 46%;
    background: linear-gradient(to top, rgba(6,5,11,0.80), rgba(6,5,11,0.42) 38%, rgba(6,5,11,0) 100%);
    opacity: 0; }
  /* A fixed zone, anchored from the TOP. Bottom-anchoring made the stem-only layer slide down to the
     clause's baseline (where the clause then drew over it) and left the eyebrow invisible. With a fixed
     top, the stem's y is the same in every layer whatever the clause says, and the clause grows down. */
  #block { position: absolute; left: 50%; top: ${1920 - CAP.bottom - CAP.zone}px; transform: translateX(-50%);
    width: ${CAP.maxWidth}px; height: ${CAP.zone}px; text-align: center; font-family: 'Nunito', sans-serif; }
  /* Set as the sentence's first line — same family and weight as the clause, a touch smaller so the
     clause still leads. As a small letterspaced eyebrow it was buried under the 78px title. */
  #stem { display: block; font-weight: 800; font-size: ${CAP.stemSize}px; letter-spacing: -0.02em;
    line-height: 1.14; color: #FFFFFF; margin-bottom: 4px; opacity: 0;
    text-shadow: 0 3px 2px rgba(0,0,0,0.55), 0 6px 30px rgba(0,0,0,0.85);
    height: ${anaphora ? Math.round(CAP.stemSize * 1.14) + 'px' : '0'};
    visibility: ${stemLit ? 'visible' : 'hidden'}; }
  #line { font-weight: 800; font-size: ${CAP.size}px; line-height: 1.14; letter-spacing: -0.02em;
    color: #FFFFFF; text-shadow: 0 3px 2px rgba(0,0,0,0.55), 0 6px 30px rgba(0,0,0,0.85); }
  .w { display: inline-block; opacity: 0; white-space: pre; }
  /* The emphasised word is LIT, not tinted. A gradient FILL made it dimmer than the white words —
     a short word only samples the gradient's dark stops, and against a bright frame it vanished. So the
     glyphs stay white and the brand becomes light behind them. This is also truer to the ending: the
     gradient runs through the film as LIGHT, and at 36s that light contracts into the K. */
  .hot { color: #FFFFFF;
    text-shadow: 0 0 16px rgba(199,155,255,0.95), 0 0 40px rgba(255,138,200,0.65),
                 0 0 78px rgba(47,164,255,0.45), 0 3px 2px rgba(0,0,0,0.6); }
</style>
<div id="scrim"></div>
<div id="block"><span id="stem">${anaphora ? cue.stem : ''}</span><span id="line">${
    words.map((x, i) => `<span class="w${x.hot ? ' hot' : ''}" data-i="${i}">${x.w}</span>${i < words.length - 1 ? '<span class="w" data-i="' + i + '"> </span>' : ''}`).join('')
  }</span></div>
<script>
  var c01 = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v };
  var out3 = function (t) { return 1 - Math.pow(1 - t, 3) };
  var words = [].slice.call(document.querySelectorAll('.w'));
  var STAG = ${CAP.stagger}, DUR = ${CAP.wordIn};
  window.renderAt = function (t) {
    // The scrim comes up first and fastest — the frame darkens a touch, then the words arrive on it.
    document.getElementById('scrim').style.opacity = String(c01(t / 0.3));
    var stem = document.getElementById('stem');
    stem.style.opacity = String(out3(c01(t / 0.42)));
    stem.style.transform = 'translateY(' + ((1 - out3(c01(t / 0.42))) * 10).toFixed(2) + 'px)';
    for (var i = 0; i < words.length; i++) {
      var p = out3(c01((t - i * STAG) / DUR));
      var el = words[i];
      el.style.opacity = String(p);
      // out of a blur and upward: the word resolves the way light resolves in this film
      el.style.filter = p < 1 ? 'blur(' + ((1 - p) * 9).toFixed(2) + 'px)' : 'none';
      el.style.transform = 'translateY(' + ((1 - p) * 20).toFixed(2) + 'px)';
    }
  };
  window.captionInDuration = function () { return (words.length - 1) * STAG + DUR };
</script>`
}

/**
 * Renders each cue to a transparent clip in `work/captions/`, and returns the cues with `.clip` set.
 * The staggered entrance is rendered as real frames (the easing and the blur are the design, and
 * ffmpeg can't express them), then the resolved frame is held for the rest of the cue.
 */
export async function renderCaptions(cues) {
  ensureDirs()
  const dir = `${WORK}/captions`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const font = nunito()
  const page = await launch({ width: 1080, height: 1920, dsf: 1, port: 9335 })
  const RGBA = '-c:v qtrle -pix_fmt argb'
  try {
    for (const cue of cues) {
      await page.setContent(captionHtml(font, cue))
      await page.evaluate('document.fonts.ready.then(function () { return 1 })')
      const inDur = Number(await page.evaluate('window.captionInDuration()')) || 0.42
      const frames = Math.max(2, Math.ceil(Math.min(inDur, Math.max(0.2, cue.duration - 0.1)) * FPS))
      for (let i = 0; i < frames; i++) {
        await page.evaluate(`(window.renderAt(${i / FPS}), 1)`)
        await page.shoot(`${dir}/${cue.id}-${String(i).padStart(3, '0')}.png`, { transparent: true })
      }
      const held = `${dir}/${cue.id}-${String(frames - 1).padStart(3, '0')}.png`
      const tail = Math.max(0.05, cue.duration - frames / FPS)
      sh(`ffmpeg -y -framerate ${FPS} -i ${dir}/${cue.id}-%03d.png ${RGBA} ${dir}/${cue.id}-in.mov`)
      sh(`ffmpeg -y -loop 1 -framerate ${FPS} -i ${held} -t ${tail.toFixed(3)} ${RGBA} ${dir}/${cue.id}-hold.mov`)
      writeFileSync(`${dir}/${cue.id}.txt`, `file '${dir}/${cue.id}-in.mov'\nfile '${dir}/${cue.id}-hold.mov'\n`)
      sh(`ffmpeg -y -f concat -safe 0 -i ${dir}/${cue.id}.txt -c copy ${dir}/${cue.id}-raw.mov`)
      const out = `${dir}/${cue.id}.mov`
      // the light goes back out, rather than a hard cut
      sh(`ffmpeg -y -i ${dir}/${cue.id}-raw.mov -vf 'format=argb,fade=t=out:st=${Math.max(0, cue.duration - CAP.out).toFixed(3)}:d=${CAP.out}:alpha=1' ${RGBA} ${out}`)
      cue.clip = out
      console.log(`  ${cue.id.padEnd(10)} ${cue.at.toFixed(2)}s +${cue.duration.toFixed(2)}s  ${String(frames).padStart(2)}f in  "${(cue.clause ?? cue.text ?? cue.stem).slice(0, 40)}"`)
    }
  } finally {
    page.close()
  }
  return cues
}

/**
 * Turns the assembled timing into the cue list. Beats 2–7 share one held "WHAT IF" eyebrow while only
 * the clause changes beneath it. Captions stop at beat 8 — see CAPTIONED_BEATS for why.
 */
export function buildCues(voAt, voDur) {
  const at = (n) => voAt[n - 1]
  const end = (n) => at(n) + voDur[n]
  const cues = []
  for (const n of CAPTIONED_BEATS) {
    if (ANAPHORA.beats.includes(n)) continue
    cues.push({ id: `beat${n}`, at: at(n), duration: +(voDur[n] + 0.4).toFixed(3), text: LINES[n - 1][1], emph: EMPHASIS[n] })
  }
  const first = ANAPHORA.beats[0], last = ANAPHORA.beats[ANAPHORA.beats.length - 1]
  cues.push({ id: 'stem', at: at(first), duration: +(end(last) + 0.4 - at(first)).toFixed(3), mode: 'stem', stem: ANAPHORA.stem })
  ANAPHORA.beats.forEach((n, i) => {
    const nextAt = i + 1 < ANAPHORA.beats.length ? at(ANAPHORA.beats[i + 1]) : end(last) + 0.4
    cues.push({ id: `clause${n}`, at: at(n), duration: +(nextAt - at(n)).toFixed(3), mode: 'clause', stem: ANAPHORA.stem, clause: ANAPHORA.clauses[n], emph: EMPHASIS[n] })
  })
  return cues.sort((a, b) => a.at - b.at)
}

// ── the driver ──────────────────────────────────────────────────────────────────────────────────
const ENC = '-c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -r 30 -an'
const sh = (c) => {
  try { return execSync(c, { stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (e) {
    console.error('FAILED:', c.slice(0, 200))
    console.error(String(e.stderr).split('\n').slice(-4).join('\n'))
    throw new Error('stop')
  }
}

async function renderSequence(page, html, name, seconds, offset) {
  const dir = `${WORK}/motion/${name}`
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  await page.setContent(html)
  await page.evaluate('document.fonts.ready.then(function () { return 1 })')
  const frames = Math.round(seconds * FPS)
  for (let i = 0; i < frames; i++) {
    const t = offset + i / FPS
    // Ambient layers: hold the app's keyframes at this instant. Dramatic layers: interpolate.
    await page.evaluate(`(function () {
      var els = document.querySelectorAll('.anim');
      for (var i = 0; i < els.length; i++) {
        var phase = Number(els[i].dataset.phase || 0);
        els[i].style.animationDelay = (-(${t} + phase)) + 's';
      }
      window.renderAt(${t});
      return 1;
    })()`)
    await page.shoot(`${dir}/f${String(i).padStart(4, '0')}.png`)
  }
  sh(`ffmpeg -y -framerate ${FPS} -i ${dir}/f%04d.png -vf 'scale=1080:1920,setsar=1' ${ENC} ${CLIPS}/beat10-${name}.mp4`)
  console.log(`  ${name}: ${frames} frames -> beat10-${name}.mp4`)
  return frames
}

/**
 * Renders f7, f8 and f9 into CLIPS. `bg` is the pull-back's final frame (a PNG on disk) and `seed`
 * is the Approve-reel rect within that 1080x1920 frame.
 */
export async function renderMotionShots({ bg, seed, probe = false }) {
  ensureDirs()
  const font = nunito()
  const kMark = dataUri(`${REPO}/apps/landing/public/kendrix-k.png`)
  const room = dataUri(`${STILLS}/beat1-room-nano.png`)
  const dim = dimHtml(font, dataUri(bg), seed, kMark)
  const card = cardHtml(font, room, kMark)

  const page = await launch({ width: 1080, height: 1920, dsf: 1, port: 9334 })
  try {
    // The collapse is the riskiest idea in the cut — look at stills before spending frames on it.
    if (probe) {
      mkdirSync(`${WORK}/motion`, { recursive: true })
      for (const [html, tag, times] of [[dim, 'dim', [0, 0.6, 0.95, 1.15, 1.35]], [card, 'card', [0, 1.0, 2.4, 3.4, 4.5]]]) {
        await page.setContent(html)
        await page.evaluate('document.fonts.ready.then(function () { return 1 })')
        for (const t of times) {
          await page.evaluate(`(function () {
            var els = document.querySelectorAll('.anim');
            for (var i = 0; i < els.length; i++) els[i].style.animationDelay = (-(${t} + Number(els[i].dataset.phase || 0))) + 's';
            window.renderAt(${t}); return 1;
          })()`)
          await page.shoot(`${WORK}/motion/probe-${tag}-${t}.png`)
        }
      }
      console.log(`probes -> ${WORK}/motion/probe-*.png`)
      return
    }
    await renderSequence(page, dim, 'f7', SHOTS.f7, 0)
    await renderSequence(page, dim, 'f8', SHOTS.f8, SHOTS.f7)
    await renderSequence(page, card, 'f9', SHOTS.f9, 0)
  } finally {
    page.close()
  }
}

// Standalone, for iterating on the CSS without rebuilding the whole finale:
//   node shoot-motion.mjs --probe
if (import.meta.url === `file://${process.argv[1]}`) {
  const bg = `${WORK}/finale/f6-last.png`
  const seedFile = `${WORK}/finale/seed-rect.json`
  if (!existsSync(bg) || !existsSync(seedFile)) {
    throw new Error(`need ${bg} and ${seedFile} — run build-finale.mjs first (it renders the pull-back)`)
  }
  await renderMotionShots({
    bg,
    seed: JSON.parse(readFileSync(seedFile, 'utf8')),
    probe: process.argv.includes('--probe'),
  })
}
