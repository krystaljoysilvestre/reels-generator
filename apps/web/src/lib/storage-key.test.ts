import { describe, expect, it } from 'vitest'
import { isLegacyUnownedUploadKey, reelIdFromKey, storageScopeFromKey } from './storage-key.js'

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

  it('recognizes only explicit platform namespaces as shared', () => {
    expect(storageScopeFromKey('style-presets/noir.webp')).toEqual({ kind: 'shared' })
    expect(storageScopeFromKey('audio/presets/tense.mp3')).toEqual({ kind: 'shared' })
    expect(storageScopeFromKey('avatars/random.webp')).toEqual({ kind: 'legacy-private' })
    expect(storageScopeFromKey('misc/random.webp')).toEqual({ kind: 'unknown' })
  })

  it('resolves channel and compilation namespaces', () => {
    expect(storageScopeFromKey(`channels/${REEL_ID}/avatar/source.webp`)).toEqual({ kind: 'channel', id: REEL_ID })
    expect(storageScopeFromKey(`compilations/${REEL_ID}/final.mp4`)).toEqual({ kind: 'compilation', id: REEL_ID })
  })

  it('preserves the ownership edge for historical generated reel music', () => {
    expect(storageScopeFromKey(`audio/reel/${REEL_ID}-abc123.mp3`)).toEqual({ kind: 'reel', id: REEL_ID })
  })

  it('rejects malformed or traversal-like keys', () => {
    expect(storageScopeFromKey(`reels/${REEL_ID}/../other.webp`)).toEqual({ kind: 'unknown' })
    expect(storageScopeFromKey(`channels/not-a-uuid/avatar.webp`)).toEqual({ kind: 'unknown' })
    expect(storageScopeFromKey('/audio/presets/tense.mp3')).toEqual({ kind: 'unknown' })
  })
})
