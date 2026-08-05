import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
const S = '/private/tmp/claude-501/-Users-krystaljoysilvestre-Workspace-app-ideas-reels-generator/64e67ce6-3b15-4ee6-b1aa-cb759148d600/scratchpad'
const jwt = readFileSync(`${S}/session.jwt`, 'utf8').trim()
const REEL = '72b3f9ad-aba3-4ca3-b6ef-40bfee74fed9'
const psql = (sql) => execSync(`docker exec reels-generator_postgres_1 psql -U postgres -d reels_dev -c "${sql}"`, { encoding: 'utf8' })

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
await ctx.addCookies([{ name: 'authjs.session-token', value: jwt, domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }])
const page = await ctx.newPage()

for (const [status, file] of [['storyboard', 'ui-render-cta.png'], ['rendering', 'ui-rendering.png'], ['spot_check', 'ui-spotcheck.png']]) {
  psql(`UPDATE reels SET status='${status}', updated_at=now() WHERE id='${REEL}'`)
  await page.goto(`http://localhost:3000/storyboard/${REEL}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)
  await page.screenshot({ path: `${S}/trailer/${file}` })
  console.log(`${status} → ${file}`)
}
// restore the true state
psql(`UPDATE reels SET status='spot_check', updated_at=now() WHERE id='${REEL}'`)
console.log('restored to spot_check')
await browser.close()
