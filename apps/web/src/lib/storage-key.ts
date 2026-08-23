// Pure storage-key parsing. Kept outside api-access so the ownership boundary can be regression-tested
// without loading auth, NextResponse, or the database.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

// undefined → not reel-scoped | null → malformed reels/ key | string → owning reel id
export function reelIdFromKey(key: string): string | null | undefined {
  if (!key.startsWith('reels/')) return undefined
  const segment = key.split('/')[1]
  return isUuid(segment) ? segment : null
}

// Scene uploads created before reel-scoping have no ownership edge at all. A random UUID is not
// authorization; reject these keys instead of letting any authenticated user consume or fetch them.
export function isLegacyUnownedUploadKey(key: string): boolean {
  return key.startsWith('uploads/')
}
