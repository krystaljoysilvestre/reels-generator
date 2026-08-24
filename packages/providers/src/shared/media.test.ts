import { describe, expect, it } from 'vitest'
import { sniffImageMediaType } from './media.js'

describe('sniffImageMediaType', () => {
  it('detects WebP from its RIFF/WEBP signature', () => {
    expect(sniffImageMediaType(Buffer.from('RIFF0000WEBP', 'ascii'))).toBe('image/webp')
  })

  it('detects JPEG even when the storage key claims WebP', () => {
    expect(sniffImageMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
  })

  it('detects PNG from its signature', () => {
    expect(sniffImageMediaType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png')
  })

  it('falls back to JPEG for unknown image bytes', () => {
    expect(sniffImageMediaType(Buffer.from('unknown'))).toBe('image/jpeg')
  })
})
