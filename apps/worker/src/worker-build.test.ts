import { describe, expect, it, vi } from 'vitest'
import {
  decodeWorkerBuild,
  encodeWorkerBuild,
  readWorkerBuild,
  writeWorkerBuild,
  WORKER_BUILD_KEY,
  WORKER_BUILD_REFRESH_MS,
  WORKER_BUILD_TTL_SECONDS,
} from '@reels/queue/worker-build'

describe('worker build report', () => {
  it('round-trips what the worker publishes', () => {
    expect(decodeWorkerBuild(encodeWorkerBuild({ short: 'd0a0c59', source: 'stamp' }))).toEqual({
      build: 'd0a0c59',
      source: 'stamp',
    })
  })

  it('passes an honest unknown through as unknown', () => {
    expect(decodeWorkerBuild(encodeWorkerBuild({ short: 'unknown', source: 'none' }))).toEqual({
      build: 'unknown',
      source: 'none',
    })
  })

  it.each([
    ['absent key', null],
    ['empty value', ''],
    ['not JSON', 'd0a0c59'],
    ['full SHA instead of short', JSON.stringify({ build: 'd0a0c59aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', source: 'stamp' })],
    ['non-hex build', JSON.stringify({ build: 'zzzzzzz', source: 'stamp' })],
    ['unknown source', JSON.stringify({ build: 'd0a0c59', source: 'operator' })],
    ['wrong types', JSON.stringify({ build: 1234567, source: true })],
  ])('reads %s as unknown', (_label, raw) => {
    expect(decodeWorkerBuild(raw)).toEqual({ build: 'unknown', source: 'none' })
  })

  it('writes with an expiry so a dead worker stops answering', async () => {
    const set = vi.fn().mockResolvedValue('OK')
    await writeWorkerBuild({ set }, { short: 'd0a0c59', source: 'stamp' })
    expect(set).toHaveBeenCalledWith(WORKER_BUILD_KEY, expect.any(String), { EX: WORKER_BUILD_TTL_SECONDS })
  })

  it('refreshes well inside the expiry', () => {
    expect(WORKER_BUILD_REFRESH_MS * 2).toBeLessThan(WORKER_BUILD_TTL_SECONDS * 1000)
  })

  it('reads back through the same key', async () => {
    const get = vi.fn().mockResolvedValue(encodeWorkerBuild({ short: 'd0a0c59', source: 'env' }))
    await expect(readWorkerBuild({ get })).resolves.toEqual({ build: 'd0a0c59', source: 'env' })
    expect(get).toHaveBeenCalledWith(WORKER_BUILD_KEY)
  })
})
