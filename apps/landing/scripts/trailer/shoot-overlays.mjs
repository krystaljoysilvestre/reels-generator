// The two synthetic overlays the finale composites: the cursor that presses Render, and the end card.
// Neither depends on the app, so a re-shoot does NOT need this — only re-run it if the mark or the
// end-card wording changes. Needs network: the end card pulls Nunito from Google Fonts.
import { readFileSync } from 'node:fs'
import { UI, REPO, ensureDirs } from './paths.mjs'
import { launch, sleep } from './cdp.mjs'

ensureDirs()
const logo = readFileSync(`${REPO}/apps/landing/public/kendrix-k.png`).toString('base64')
const page = await launch({ width: 1080, height: 1920, dsf: 1 })

try {
  // 1) cursor arrow with a soft shadow, transparent bg
  await page.resize(120, 140, 1)
  await page.setContent(`<body style="margin:0;background:transparent">
<svg width="120" height="140" viewBox="0 0 120 140" xmlns="http://www.w3.org/2000/svg">
  <filter id="s"><feDropShadow dx="3" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".55"/></filter>
  <path filter="url(#s)" d="M18 8 L18 104 L44 80 L60 118 L82 108 L66 70 L100 66 Z" fill="#fff" stroke="#111" stroke-width="4"/>
</svg></body>`)
  await sleep(500)
  await page.shoot(`${UI}/cursor.png`, { transparent: true })
  console.log('cursor ok')

  // 2) end card
  await page.resize(1080, 1920, 1)
  await page.setContent(`<html><head>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap" rel="stylesheet">
</head><body style="margin:0;width:1080px;height:1920px;background:#07060C;display:flex;align-items:center;justify-content:center;overflow:hidden">
  <div style="position:absolute;top:38%;left:50%;transform:translate(-50%,-50%);width:1400px;height:900px;background:radial-gradient(circle,rgba(155,59,255,.22),transparent 62%)"></div>
  <div style="position:absolute;bottom:12%;left:50%;transform:translateX(-50%);width:1200px;height:600px;background:radial-gradient(circle,rgba(255,45,155,.14),transparent 65%)"></div>
  <div style="position:relative;text-align:center;font-family:Nunito,-apple-system,sans-serif;color:#F4F1F7">
    <div style="font-size:52px;font-weight:800;letter-spacing:-.02em;opacity:.96">Every Story Begins Here.</div>
    <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin-top:64px">
      <img src="data:image/png;base64,${logo}" style="width:104px;height:auto">
      <span style="font-size:96px;font-weight:900;letter-spacing:-.03em">Kendrix</span>
    </div>
  </div>
</body></html>`)
  await sleep(2500) // the webfont has to arrive, or the card renders in the fallback face
  await page.shoot(`${UI}/endcard.png`)
  console.log('endcard ok')
} finally {
  page.close()
}
