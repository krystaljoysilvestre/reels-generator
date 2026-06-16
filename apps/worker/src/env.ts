// Loads the monorepo-root .env.local (single source of truth).
// Import this FIRST, before anything that reads process.env.
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// When run via `pnpm --filter worker …`, cwd is apps/worker → root is ../../
const rootEnvLocal = resolve(process.cwd(), '../../.env.local')
const rootEnv = resolve(process.cwd(), '../../.env')

if (existsSync(rootEnvLocal)) {
  config({ path: rootEnvLocal })
} else if (existsSync(rootEnv)) {
  config({ path: rootEnv })
} else {
  config() // fall back to default lookup
}
