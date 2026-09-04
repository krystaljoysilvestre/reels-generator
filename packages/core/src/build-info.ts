// Which commit is this process actually running?
//
// Before this existed the answer lived in whoever remembered running `railway up`. On 2026-09-04 that
// memory was two days and two commits stale on the worker while the web service was current, and
// nothing anywhere reported the difference — so a forced-failure boundary that had been committed,
// tested and pushed simply was not there, and arming it would have produced a clean reel that proved
// nothing. A build the operator asserts is not evidence; a build the process reports is.
//
// Three sources, most trusted first:
//   BUILD_COMMIT            — written into the image by scripts/deploy-railway.sh (the `railway up` path)
//   RAILWAY_GIT_COMMIT_SHA  — injected by Railway, but only for GitHub-triggered deploys
//   .build-commit           — the stamp file the deploy script leaves in the upload context
//
// It never guesses. A wrong commit is worse than no commit, because the entire point is to stop
// asserting the build from memory — so an unstamped process says `unknown` out loud.

import { readFileSync } from 'node:fs'

export const UNKNOWN_COMMIT = 'unknown'

export type BuildCommitSource = 'env' | 'railway' | 'stamp' | 'none'

export type BuildInfo = {
  /** Full 40-character SHA, or `unknown`. */
  commit: string
  /** First 7 characters, or `unknown` — what a human reads. */
  short: string
  /** Which of the three sources answered. Reported so an `unknown` is debuggable. */
  source: BuildCommitSource
}

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  // Reject anything that is not a plausible SHA rather than passing it through. A truncated env var or
  // a stray log line in the stamp file would otherwise be reported as though it were the build.
  return trimmed && SHA_PATTERN.test(trimmed) ? trimmed.toLowerCase() : undefined
}

export function shortCommit(commit: string): string {
  return commit === UNKNOWN_COMMIT ? UNKNOWN_COMMIT : commit.slice(0, 7)
}

/**
 * Pure resolver — the sources are injected so precedence is testable without an image or a filesystem.
 */
export function resolveBuildInfo(
  env: Record<string, string | undefined>,
  readStamp: () => string | undefined,
): BuildInfo {
  const fromEnv = clean(env['BUILD_COMMIT'])
  if (fromEnv) return { commit: fromEnv, short: shortCommit(fromEnv), source: 'env' }

  const fromRailway = clean(env['RAILWAY_GIT_COMMIT_SHA'])
  if (fromRailway) return { commit: fromRailway, short: shortCommit(fromRailway), source: 'railway' }

  const fromStamp = clean(readStamp())
  if (fromStamp) return { commit: fromStamp, short: shortCommit(fromStamp), source: 'stamp' }

  return { commit: UNKNOWN_COMMIT, short: UNKNOWN_COMMIT, source: 'none' }
}

// Both images `COPY . .` into /app, so the stamp lands next to package.json at the container root. In
// dev there is no stamp and no Railway env, which correctly reports `unknown` rather than pretending
// the working tree is a build.
export const STAMP_PATH = '/app/.build-commit'

function readStampFile(): string | undefined {
  try {
    return readFileSync(STAMP_PATH, 'utf8')
  } catch {
    // Absent stamp is the normal case in dev and in any GitHub-triggered deploy. Not an error.
    return undefined
  }
}

let cached: BuildInfo | undefined

/** Memoized: the answer cannot change while the process lives. */
export function buildInfo(): BuildInfo {
  cached ??= resolveBuildInfo(process.env, readStampFile)
  return cached
}
