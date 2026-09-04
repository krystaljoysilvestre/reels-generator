import { describe, expect, it } from 'vitest'
import { resolveBuildInfo, shortCommit, UNKNOWN_COMMIT } from './build-info.js'

const SHA = 'ffd4d5661f2a3b4c5d6e7f8091a2b3c4d5e6f708'
const OTHER = 'aaaaaaabbbbbbbcccccccdddddddeeeeeeefffff'
const noStamp = () => undefined

describe('resolveBuildInfo', () => {
  it('prefers BUILD_COMMIT, the stamp the deploy script writes into the image', () => {
    const info = resolveBuildInfo({ BUILD_COMMIT: SHA, RAILWAY_GIT_COMMIT_SHA: OTHER }, () => OTHER)
    expect(info).toEqual({ commit: SHA, short: 'ffd4d56', source: 'env' })
  })

  it('falls back to Railway git metadata, which exists only for GitHub-triggered deploys', () => {
    const info = resolveBuildInfo({ RAILWAY_GIT_COMMIT_SHA: SHA }, () => OTHER)
    expect(info.source).toBe('railway')
    expect(info.commit).toBe(SHA)
  })

  it('falls back to the stamp file left in the upload context', () => {
    const info = resolveBuildInfo({}, () => `${SHA}\n`)
    expect(info).toEqual({ commit: SHA, short: 'ffd4d56', source: 'stamp' })
  })

  it('says unknown rather than guessing when nothing is stamped', () => {
    const info = resolveBuildInfo({}, noStamp)
    expect(info).toEqual({ commit: UNKNOWN_COMMIT, short: UNKNOWN_COMMIT, source: 'none' })
  })

  it('rejects a value that is not a plausible SHA instead of reporting it as the build', () => {
    // A wrong commit is worse than no commit: it would be asserted with the same confidence as a real
    // one. Empty strings, placeholders and stray log lines must all read as unstamped.
    for (const bad of ['', '   ', 'HEAD', 'refs/heads/main', 'not-a-sha', '$BUILD_COMMIT', 'ffd4d5']) {
      expect(resolveBuildInfo({ BUILD_COMMIT: bad }, noStamp).source).toBe('none')
    }
  })

  it('accepts an already-short SHA and normalizes case', () => {
    expect(resolveBuildInfo({ BUILD_COMMIT: 'FFD4D56' }, noStamp)).toEqual({
      commit: 'ffd4d56',
      short: 'ffd4d56',
      source: 'env',
    })
  })
})

describe('shortCommit', () => {
  it('takes the first seven characters', () => {
    expect(shortCommit(SHA)).toBe('ffd4d56')
  })

  it('leaves unknown alone rather than truncating it to a fake SHA', () => {
    expect(shortCommit(UNKNOWN_COMMIT)).toBe(UNKNOWN_COMMIT)
  })
})
