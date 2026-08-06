// Mints a local authjs session cookie so the capture script can open the storyboard as a signed-in
// user. LOCAL DEV ONLY: it needs AUTH_SECRET from the gitignored .env.local, which is the same secret
// that signs real sessions — anyone holding it can already forge one. The cookie it writes lands in
// the gitignored asset dir and lasts 24h.
//
//   node mint-cookie.mjs                    # first active admin
//   node mint-cookie.mjs <userId> <email>
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { REPO, SRC, ensureDirs } from './paths.mjs'

ensureDirs()
const OUT = process.env.SESSION_JWT ?? `${SRC}/session.jwt`
const PG = process.env.PG_CONTAINER ?? 'reels-generator_postgres_1'

const env = readFileSync(`${REPO}/.env.local`, 'utf8')
const secret = /^AUTH_SECRET=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '')
if (!secret) throw new Error('AUTH_SECRET not found in .env.local')

let [uid, email] = process.argv.slice(2)
if (!uid) {
  const row = execSync(
    `docker exec ${PG} psql -U postgres -d reels_dev -tAc "select id,email from users where role='admin' and status='active' limit 1"`,
    { encoding: 'utf8' },
  ).trim()
  if (!row) throw new Error('no active admin in the dev DB — pass a user id explicitly')
  ;[uid, email] = row.split('|')
}

// dotenv can't be resolved from outside the workspaces, and neither can @auth/core by bare specifier —
// reach into the pnpm store for the same copy the web app runs.
const pnpmDir = `${REPO}/node_modules/.pnpm`
const authCore = readdirSync(pnpmDir).find((d) => d.startsWith('@auth+core@'))
if (!authCore) throw new Error('@auth/core not found under node_modules/.pnpm')
const require = createRequire(`${pnpmDir}/${authCore}/node_modules/@auth/core/package.json`)
const { encode } = await import(require.resolve('@auth/core/jwt'))

// The session callback only needs token.uid; role/status are read fresh from the DB per request.
const token = await encode({
  token: { sub: uid, uid, email },
  secret,
  salt: 'authjs.session-token',
  maxAge: 60 * 60 * 24,
})
writeFileSync(OUT, token)
console.log(`minted a 24h session for ${email} (${uid}) → ${OUT}`)
