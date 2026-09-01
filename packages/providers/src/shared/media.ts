export type ImageMediaType = 'image/webp' | 'image/jpeg' | 'image/png'

// Provider responses and sourced media do not always match the extension of the R2 key that stores them.
// Vision APIs validate the declared media type against the bytes, so every boundary must sniff the payload
// rather than trust `.webp` (or provider metadata) and turn a valid image into a deterministic 400.
export function sniffImageMediaType(buf: Buffer): ImageMediaType {
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png'
  }
  return 'image/jpeg'
}
