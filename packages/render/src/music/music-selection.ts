// Music track selection — docs/07 §4
// Picks the track from the channel music_pack whose moodTags best match
// the scene moods around peakAnchorMs.

import type { MusicTrack } from '@reels/core'

export interface SelectMusicParams {
  musicPack: MusicTrack[]
  musicType: 'low_drone' | 'drone_swell' | 'riser_sting'
  moodTags: string[]           // from the audio_script music cue
  defaultDroneId?: string      // channel's fallback drone id
}

export function selectMusicTrack(params: SelectMusicParams): MusicTrack | null {
  if (params.musicPack.length === 0) return null

  // First: try to find a type+mood match
  const scored = params.musicPack.map((track) => {
    const typeMatch = track.type === params.musicType ? 2 : 0
    const tagOverlap = params.moodTags.filter((t) => track.moodTags.includes(t)).length
    return { track, score: typeMatch + tagOverlap }
  })

  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]
  if (best && best.score > 0) return best.track

  // Fallback: channel's default drone
  if (params.defaultDroneId) {
    const def = params.musicPack.find((t) => t.id === params.defaultDroneId)
    if (def) return def
  }

  // Last resort: first drone in the pack
  return params.musicPack.find((t) => t.type === 'low_drone') ?? params.musicPack[0] ?? null
}
