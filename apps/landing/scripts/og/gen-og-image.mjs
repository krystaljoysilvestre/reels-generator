// The social share card — public/og.png, 1200×630.
//
// Rendered rather than designed by hand so it can be regenerated when the tagline changes:
//   node gen-og-image.mjs
//
// Why a static PNG and not next/og's ImageResponse: the card is the same for every page, so
// generating it per request buys nothing and costs runtime. A committed file is also the only
// version that survives a crawler fetching the URL before the app has warmed up — and share-card
// scrapers are exactly the clients least likely to retry.
//
// The one hard constraint is legibility at thumbnail size. A share card is read at ~200px wide in
// a timeline, so the wordmark is deliberately enormous and the supporting line is short. Anything
// subtle here disappears where it matters.
import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { launch, sleep } from '../trailer/cdp.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../public/og.png')

// The claim on the card. Keep it to one short line — see the legibility note above.
const TAGLINE = 'Every frame is intentionally directed.'
const KICKER = 'THE STORYTELLING OPERATING SYSTEM'

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&family=Space+Mono:wght@700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px; overflow: hidden; position: relative;
    background: #07060C; font-family: Nunito, sans-serif; color: #fff;
  }
  /* The same light leaks the site uses, so the card reads as the same object as the page. */
  .leak {
    position: absolute; inset: 0;
    background:
      radial-gradient(760px 420px at 84% -12%, rgba(155,59,255,0.40), transparent 62%),
      radial-gradient(620px 380px at 6% 108%, rgba(47,164,255,0.24), transparent 60%),
      radial-gradient(520px 300px at 62% 108%, rgba(255,45,155,0.20), transparent 62%);
  }
  .vignette {
    position: absolute; inset: 0;
    background: radial-gradient(120% 90% at 50% 45%, transparent 52%, rgba(4,3,8,0.7));
  }
  .frame {
    position: absolute; inset: 40px; border: 1px solid rgba(255,255,255,0.10); border-radius: 20px;
  }
  /* Film-frame corners — the brand's crop marks. */
  .crop { position: absolute; width: 22px; height: 22px; border-color: rgba(255,255,255,0.34); }
  .tl { top: -1px; left: -1px; border-left: 2px solid; border-top: 2px solid; }
  .tr { top: -1px; right: -1px; border-right: 2px solid; border-top: 2px solid; }
  .bl { bottom: -1px; left: -1px; border-left: 2px solid; border-bottom: 2px solid; }
  .br { bottom: -1px; right: -1px; border-right: 2px solid; border-bottom: 2px solid; }

  .stack {
    position: absolute; inset: 40px; display: flex; flex-direction: column;
    justify-content: center; padding: 0 76px;
  }
  .kicker {
    font-family: 'Space Mono', monospace; font-weight: 700; font-size: 19px;
    letter-spacing: 0.22em; color: #B99AE4; margin-bottom: 26px;
  }
  .wordmark {
    font-weight: 900; font-size: 156px; line-height: 0.92; letter-spacing: -0.055em;
  }
  /* One gradient K — the same payoff the trailer's ending builds to. */
  .k {
    background: linear-gradient(96deg, #2FA4FF, #9B3BFF 42%, #FF2D9B 74%, #FF9A3D);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .rule {
    width: 132px; height: 5px; border-radius: 5px; margin: 34px 0 30px;
    background: linear-gradient(90deg, #9B3BFF, #FF2D9B);
  }
  .tagline { font-weight: 800; font-size: 45px; line-height: 1.16; letter-spacing: -0.025em; }
  .foot {
    position: absolute; left: 116px; right: 116px; bottom: 74px;
    display: flex; justify-content: space-between; align-items: center;
    font-family: 'Space Mono', monospace; font-weight: 700; font-size: 18px;
    letter-spacing: 0.13em; color: rgba(255,255,255,0.44);
  }
</style>
</head>
<body>
  <div class="leak"></div>
  <div class="vignette"></div>
  <div class="frame">
    <span class="crop tl"></span><span class="crop tr"></span>
    <span class="crop bl"></span><span class="crop br"></span>
  </div>
  <div class="stack">
    <div class="kicker">${KICKER}</div>
    <div class="wordmark"><span class="k">K</span>endrix</div>
    <div class="rule"></div>
    <div class="tagline">${TAGLINE}</div>
  </div>
  <div class="foot"><span>KENDRIX.IO</span><span>INVITE-ONLY BETA</span></div>
</body>
</html>`

// Render at 2× and let the PNG carry the detail — thumbnail downscaling is where thin type dies.
const b = await launch({ width: 1200, height: 630, dsf: 2, port: 9361 })
await b.setContent(html)
// Web fonts land after first paint; screenshotting before they do silently ships a fallback face.
await b.evaluate('document.fonts.ready.then(() => true)')
await sleep(1200)
const loaded = await b.evaluate(
  `document.fonts.check('900 156px Nunito') && document.fonts.check('700 19px "Space Mono"')`,
)
if (!loaded) {
  b.close()
  throw new Error('web fonts did not load — the card would render in a fallback face')
}
await b.shoot(OUT)
b.close()

console.log(`wrote ${OUT} (${Math.round(statSync(OUT).size / 1024)} KB)`)
