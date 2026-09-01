// Pure storage-key parsing. Kept outside api-access so the ownership boundary can be regression-tested
// without loading auth, NextResponse, or the database.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SHARED_PREFIXES = [
  'style-presets/',
  'audio/presets/',
  'audio/music/',
  'audio/ambient/',
  'references/audio/',
] as const

export type StorageScope =
  | { kind: 'shared' }
  | { kind: 'channel'; id: string }
  | { kind: 'reel'; id: string }
  | { kind: 'compilation'; id: string }
  | { kind: 'legacy-private' }
  | { kind: 'unknown' }

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

function hasSafeSegments(key: string): boolean {
  return key.length > 0 && !key.startsWith('/') && key.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

// Every private object namespace must resolve to a database-owned resource. Keys outside these
// namespaces are never implicitly public: callers may only use them when a legacy DB reference
// proves ownership.
export function storageScopeFromKey(key: string): StorageScope {
  if (!hasSafeSegments(key)) return { kind: 'unknown' }
  if (SHARED_PREFIXES.some((prefix) => key.startsWith(prefix))) return { kind: 'shared' }

  const [namespace, id] = key.split('/')
  if (namespace === 'channels') return isUuid(id) ? { kind: 'channel', id } : { kind: 'unknown' }
  if (namespace === 'reels') return isUuid(id) ? { kind: 'reel', id } : { kind: 'unknown' }
  if (namespace === 'compilations') return isUuid(id) ? { kind: 'compilation', id } : { kind: 'unknown' }

  // Historical AI music used audio/reel/<reel-id>-<prompt-hash>.mp3. Keep the ownership edge while
  // new generations move into reels/<id>/music/.
  if (key.startsWith('audio/reel/')) {
    const remainder = key.slice('audio/reel/'.length)
    const reelId = remainder.slice(0, 36)
    if (isUuid(reelId) && (remainder[36] === '-' || remainder[36] === '/')) return { kind: 'reel', id: reelId }
    return { kind: 'unknown' }
  }

  if (['avatars', 'channel-music', 'style-options', 'style-refs', 'uploads'].includes(namespace)) {
    return { kind: 'legacy-private' }
  }
  return { kind: 'unknown' }
}

// undefined → not reel-scoped | null → malformed reels/ key | string → owning reel id
export function reelIdFromKey(key: string): string | null | undefined {
  if (!key.startsWith('reels/')) return undefined
  const scope = storageScopeFromKey(key)
  return scope.kind === 'reel' ? scope.id : null
}

// Scene uploads created before reel-scoping have no ownership edge at all. A random UUID is not
// authorization; reject these keys instead of letting any authenticated user consume or fetch them.
export function isLegacyUnownedUploadKey(key: string): boolean {
  return key.startsWith('uploads/')
}
