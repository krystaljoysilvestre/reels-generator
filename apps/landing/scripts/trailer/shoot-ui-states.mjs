// Beat 10's app footage. Captures the real storyboard editor in three states, and MEASURES the
// geometry the finale needs (the Render-reel CTA, the rendering card, the dock, the frame) so
// build-finale.mjs never hard-codes crop windows that a redesign silently invalidates.
//
//   node shoot-ui-states.mjs                       # needs the web app up + a session cookie
//   REEL_ID=… WEB_PORT=3000 SESSION_JWT=/path/to/session.jwt node shoot-ui-states.mjs
//
// It flips the reel's status in postgres to reach each state, then restores the status it found.
import { execSync } from 'node:child_process'
import { existsSync, writeFileSync, readFileSync } from 'node:fs'
import { UI, SRC, ensureDirs } from './paths.mjs'
import { launch, sleep } from './cdp.mjs'

ensureDirs()

const REEL = process.env.REEL_ID ?? '72b3f9ad-aba3-4ca3-b6ef-40bfee74fed9'
const PORT = process.env.WEB_PORT ?? '3000'
// Lives in the gitignored asset dir so a minted cookie can never be committed.
const JWT_FILE = process.env.SESSION_JWT ?? `${SRC}/session.jwt`
const PG = process.env.PG_CONTAINER ?? 'reels-generator_postgres_1'
// 1600×1000 at dsf 2 → 3200×2000 masters, the size the finale's crops are expressed against.
const VIEW = { width: 1600, height: 1000, dsf: 2 }

if (!existsSync(JWT_FILE)) throw new Error(`no session cookie at ${JWT_FILE} — mint one (see README)`)
const jwt = readFileSync(JWT_FILE, 'utf8').trim()

const psql = (sql) => execSync(`docker exec ${PG} psql -U postgres -d reels_dev -tAc "${sql}"`, { encoding: 'utf8' }).trim()
const found = psql(`select status from reels where id='${REEL}'`)
if (!found) throw new Error(`reel ${REEL} not found`)
const SCENE_COUNT = Number(psql(`select count(*) from scenes where reel_id='${REEL}'`))
console.log(`reel ${REEL} is at '${found}' (${SCENE_COUNT} scenes) — will restore it`)

const page = await launch({ ...VIEW })
await page.setCookie({
  name: 'authjs.session-token', value: jwt, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax',
})

// Measured in CSS px; the masters are dsf× that. Written out so the finale derives its crops.
const MEASURE = `(() => {
  const px = (el) => { if (!el) return null; const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const byText = (sel, text) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim().startsWith(text))
  return {
    viewport: { w: innerWidth, h: innerHeight, dsf: devicePixelRatio },
    renderCta: px(byText('button.btn-accent', 'Render reel')),
    // The post-render bar's gradient CTA. In the finale this is the last light left alive when the
    // room dims, and the seed the Kendrix K grows out of — so its rect drives that shot.
    approveReel: px(byText('button', 'Approve reel')),
    dock: px(document.querySelector('.bg-night-dock')),
    frame: px(document.querySelector('video, .frame-state')?.closest('div')),
    strip: px(document.querySelector('.strip-scroll')),
    // The "Rolling your reel" card — the finale's push-in centres on this.
    renderingCard: px(document.querySelector('[role="status"] .card')),
    // The finished reel playing inside the editor — the pull-back composites the reel video into
    // this rect, so it must be measured, never guessed. Found via its own "The reel" label, NOT by
    // taking the first <video src>: the scene stage has one too, and it comes first in the DOM.
    reelPreview: px(
      [...document.querySelectorAll('p')]
        .find((p) => p.textContent.trim() === 'The reel')
        ?.parentElement?.querySelector('video'),
    ),
  }
})()`

// Nothing may be caught mid-load. The traps, all of which have already produced a bad frame:
//   · pre-hydration — the server HTML has no scene selected, so the stage reads "Pick a scene to start"
//     and every filmstrip frame is blank. A plain sleep passes this by luck.
//   · the narrator chip still reading "Finding a voice…" (the recommendation fetch).
//   · a filmstrip thumbnail still fetching from R2 through /api/asset.
const PROBE = `(() => {
  if (!document.body) return { navigating: true } // probed between navigation commit and first paint
  const t = document.body.innerText
  const imgs = [...document.images].filter((i) => i.currentSrc)
  return {
    unselected: t.includes('Pick a scene to start'),
    // Two different chips, two different strings: the dock says "Finding a voice…", the
    // post-render bar says "Finding voices…". Both are the same loading state.
    findingVoice: /Finding (a )?voice/.test(t),
    rendering: t.includes('Rolling your reel'),
    loadedImgs: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    pendingImgs: imgs.filter((i) => !i.complete || !i.naturalWidth).length,
  }
})()`
// Hydration is the gate for every state; each state then names what it must additionally show.
// The rendering state can't ask for the filmstrip — the overlay unmounts it — so it settles on the
// overlay's own copy plus a picture count that has stopped moving.
const settled = {
  storyboard: (p) => !p.unselected && !p.findingVoice && p.loadedImgs >= SCENE_COUNT && !p.pendingImgs,
  rendering: (p) => p.rendering && p.loadedImgs > 0 && !p.pendingImgs,
  // The post-render bar has its own narrator chip, which spins "Finding voices…" while the
  // recommendations load — it leaked a loading spinner into the cut-2 capture.
  spot_check: (p) => !p.unselected && !p.findingVoice && p.loadedImgs >= SCENE_COUNT && !p.pendingImgs,
}
const STABLE = 3 // consecutive probes with an unchanged picture count
const waitReady = async (status) => {
  let last, stable = 0
  for (let i = 0; i < 80; i++) {
    // A probe can fail outright while the page swaps execution contexts — that's just "not ready".
    const p = await page.evaluate(PROBE).catch(() => ({ navigating: true }))
    stable = last && p.loadedImgs === last.loadedImgs ? stable + 1 : 0
    last = p
    if (settled[status](p) && stable >= STABLE) return
    await sleep(500)
  }
  throw new Error(`${status} never settled: ${JSON.stringify(last)}`)
}

const geometry = {}
const STATES = [
  ['storyboard', 'ui-render-cta.png'],
  ['rendering', 'ui-rendering.png'],
  ['spot_check', 'ui-spotcheck.png'],
]
try {
  for (const [status, file] of STATES) {
    psql(`UPDATE reels SET status='${status}', updated_at=now() WHERE id='${REEL}'`)
    await page.goto(`http://localhost:${PORT}/storyboard/${REEL}`)
    await waitReady(status)
    await sleep(2500) // the rendering overlay's pop-in and the spend slate's value-flash both need to land
    geometry[status] = await page.evaluate(MEASURE)
    await page.shoot(`${UI}/${file}`)
    const m = geometry[status]
    console.log(`${status} → ${file}${m.renderCta ? `  cta @ ${JSON.stringify(m.renderCta)}` : ''}${m.renderingCard ? `  card @ ${JSON.stringify(m.renderingCard)}` : ''}`)
  }
  writeFileSync(`${UI}/ui-geometry.json`, JSON.stringify(geometry, null, 2))
} finally {
  // The reel is a real row in the founder's dev DB — it must never be left on a borrowed status.
  psql(`UPDATE reels SET status='${found}', updated_at=now() WHERE id='${REEL}'`)
  console.log(`restored to ${found}`)
  page.close()
}
