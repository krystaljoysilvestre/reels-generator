import { afterEach, describe, expect, it, vi } from 'vitest'
import { unexpectedRegenImageError } from './regen-image-error.js'

describe('unexpectedRegenImageError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs the internal failure and returns a creator-safe JSON error', async () => {
    const error = new Error('database unavailable')
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = unexpectedRegenImageError(error)

    expect(log).toHaveBeenCalledWith('[regen-image] unexpected failure', error)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'That take didn’t come through.' })
  })
})
