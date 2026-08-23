import { describe, expect, it } from 'vitest'
import { isLegacyUnownedUploadKey, reelIdFromKey } from './storage-key.js'

const REEL_ID = '63a17ae7-8de0-4996-b99c-184f6bc7c3ab'

describe('storage ownership keys', () => {
  it('resolves a reel-scoped upload to its owning reel', () => {
    expect(reelIdFromKey(`reels/${REEL_ID}/uploads/reference.webp`)).toBe(REEL_ID)
  })

  it('rejects malformed reel namespaces', () => {
    expect(reelIdFromKey('reels/not-a-uuid/uploads/reference.webp')).toBeNull()
  })

  it('identifies legacy uploads that have no tenant ownership edge', () => {
    expect(isLegacyUnownedUploadKey('uploads/leaked.webp')).toBe(true)
    expect(isLegacyUnownedUploadKey(`reels/${REEL_ID}/uploads/owned.webp`)).toBe(false)
  })
})
