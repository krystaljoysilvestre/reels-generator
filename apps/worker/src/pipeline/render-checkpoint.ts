export type VisualCheckpointMeta = {
  type: 'visual_cache'
  durationMs: number
  visualFingerprint: string
}

export function visualCheckpointKey(reelId: string): string {
  return `reels/${reelId}/visual.mp4`
}

export function visualCheckpointMeta(durationMs: number, visualFingerprint: string): VisualCheckpointMeta {
  return { type: 'visual_cache', durationMs, visualFingerprint }
}

export function visualCheckpointMatches(
  meta: Record<string, unknown>,
  durationMs: number,
  visualFingerprint: string,
): boolean {
  return meta['durationMs'] === durationMs && meta['visualFingerprint'] === visualFingerprint
}
