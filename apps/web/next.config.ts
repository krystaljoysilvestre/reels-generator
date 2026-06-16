import type { NextConfig } from 'next'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'

// Load monorepo-root .env.local (single source of truth) into the Next server process.
const rootEnv = resolve(process.cwd(), '../../.env.local')
if (existsSync(rootEnv)) config({ path: rootEnv })

const nextConfig: NextConfig = {
  transpilePackages: ['@reels/core', '@reels/db', '@reels/providers'],
  webpack: (config) => {
    // Workspace packages use NodeNext '.js' import specifiers that resolve to '.ts' sources.
    // Tell webpack to try .ts/.tsx when an import ends in .js.
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    }
    return config
  },
}

export default nextConfig
