// Magic-byte sniffing for operator uploads. Don't trust the client-declared Content-Type — it's
// attacker-controlled, so a blob can be mislabeled as media. We verify the real bytes and, for images,
// treat the sniffed type as authoritative for storage. (/api/asset also sends X-Content-Type-Options:
// nosniff, so a mislabeled blob can't be sniffed into something executable on the way back out.)

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp'

export const IMAGE_EXT: Record<ImageMime, 'png' | 'jpg' | 'webp'> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// Returns the real image type from magic bytes, or null if the bytes aren't a supported image.
export function sniffImageMime(buf: Buffer): ImageMime | null {
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

// True if the bytes match a recognized audio container/stream. Precise MP3-vs-AAC classification from
// bytes is unreliable (their frame-sync signatures overlap), so this is a presence check — enough to
// reject a non-audio blob (e.g. HTML/script) mislabeled with an audio Content-Type. Callers keep the
// (allowlisted) declared type for the stored object; this just gates that the payload is really audio.
export function looksLikeAudio(buf: Buffer): boolean {
  if (buf.length >= 3 && buf.toString('ascii', 0, 3) === 'ID3') return true // MP3 with ID3 tag
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true // MPEG/ADTS frame sync
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') return true // WAV
  if (buf.length >= 4 && buf.toString('ascii', 0, 4) === 'OggS') return true // OGG
  if (buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp') return true // MP4/M4A/AAC-in-MP4
  return false
}
