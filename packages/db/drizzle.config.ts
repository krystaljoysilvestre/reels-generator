import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// Load monorepo-root .env.local (single source of truth)
const rootEnv = resolve(process.cwd(), '../../.env.local')
if (existsSync(rootEnv)) config({ path: rootEnv })

export default defineConfig({
  schema: './src/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL']!,
  },
  verbose: true,
  strict: true,
})
