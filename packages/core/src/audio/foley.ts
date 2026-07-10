// Foley placement — turns spotted foley assets (each tagged with the scene it came from and its
// clip-relative time) into reel-timeline SFX events for the mixer. Pure + unit-testable; the mixer does
// only I/O around it. Placement is computed HERE at mix time (not baked in at spotting) so a re-timed
// narration re-places foley correctly without re-watching the clips — the clip's own timing never changed.

import { clipPlaybackRate, clipMsToReelMs, clipVisibleEndMs } from '../timings/clip-playback.js'
import { dropEventsNear } from './sfx-rules.js'

export interface FoleyAssetMeta {
  foley: true
  sceneIdx: number
  clipMs: number            // motion timestamp within the raw clip
  clipDurationSec: number   // the raw clip's length (5 or 10) — drives the playback-rate stretch
  volumeDb: number
  durationMs?: number
}

export interface FoleyAsset {
  storageKey: string
  createdAt: Date
  meta: FoleyAssetMeta
}

export interface FoleySceneSpan {
  idx: number
  startMs: number
  endMs: number
}

export interface PlacedFoley {
  storageKey: string
  atMs: number
  volumeDb: number
}

// Map foley assets to reel-time events. Steps: newest-first dedupe per (sceneIdx, clipMs) so a re-spotted
// clip's latest take wins; map clip time → reel time via the shared playback math; drop events that fall
// past the clip's visible window (frozen tail / scene end); clamp levels to the realism band; drop any
// that collide with a narration-anchored cue; cap per scene.
export function buildFoleyEvents(params: {
  foley: FoleyAsset[]
  sceneSpans: FoleySceneSpan[]
  anchoredAtMs: number[]
  maxPerScene?: number
  dedupeWindowMs?: number
}): PlacedFoley[] {
  const maxPerScene = params.maxPerScene ?? 3
  const dedupeWindowMs = params.dedupeWindowMs ?? 1200
  const spanByIdx = new Map(params.sceneSpans.map((s) => [s.idx, s]))

  // Newest-first, so the first asset seen per (scene, clipMs) is the current take.
  const sorted = [...params.foley].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const seen = new Set<string>()
  const perScene = new Map<number, PlacedFoley[]>()

  for (const asset of sorted) {
    const m = asset.meta
    const key = `${m.sceneIdx}:${m.clipMs}`
    if (seen.has(key)) continue
    seen.add(key)

    const span = spanByIdx.get(m.sceneIdx)
    if (!span) continue // scene no longer exists / re-timed away

    const sceneSec = (span.endMs - span.startMs) / 1000
    const rate = clipPlaybackRate(m.clipDurationSec, sceneSec)
    const atMs = clipMsToReelMs(span.startMs, m.clipMs, rate)
    const visibleEnd = clipVisibleEndMs(span.startMs, span.endMs, m.clipDurationSec, rate)
    if (atMs < span.startMs || atMs > visibleEnd) continue // motion falls on a frozen/absent frame

    const volumeDb = Math.min(-6, Math.max(-10, m.volumeDb))
    const list = perScene.get(m.sceneIdx) ?? []
    list.push({ storageKey: asset.storageKey, atMs, volumeDb })
    perScene.set(m.sceneIdx, list)
  }

  // Cap per scene (earliest events win — they're the ones the viewer reaches first), then dedupe against
  // narration-anchored cues so foley never doubles a designer hit on the same beat.
  const placed: PlacedFoley[] = []
  for (const list of perScene.values()) {
    list.sort((a, b) => a.atMs - b.atMs)
    placed.push(...list.slice(0, maxPerScene))
  }
  return dropEventsNear(placed, params.anchoredAtMs, dedupeWindowMs)
}
