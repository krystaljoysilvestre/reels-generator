import React from 'react'
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion'
import { SceneClip } from '../components/SceneClip.js'
import { SubtitleOverlay } from '../components/SubtitleOverlay.js'
import { GradeOverlay } from '../components/GradeOverlay.js'
import type { ReelCompositionProps } from '../types.js'

export type { ReelCompositionProps } from '../types.js'
export type { ReelScene, SubtitleChunk } from '../types.js'

// 1080×1920 @ 30fps — constants set by the Composition registration in Root.tsx
export const REEL_WIDTH = 1080
export const REEL_HEIGHT = 1920
export const REEL_FPS = 30

// Map a scene's mood words (+ tier) → atmosphere intensity 0–1. Tense/dread beats push the grade
// (grain/flicker/vignette) harder; quiet beats sit lower; hero (video) beats get a small boost.
// Substring match so "tense", "tension", "tensed" all hit. Unflagged scenes land slightly calm.
const TENSE_WORDS = [
  'tense', 'dread', 'fear', 'afraid', 'terror', 'horror', 'panic', 'menac', 'threat', 'ominous',
  'sinister', 'eerie', 'unsettl', 'creep', 'anxious', 'claustro', 'suspense', 'shock', 'violent',
  'dark', 'cold', 'forebod', 'haunt', 'uneasy',
]
const CALM_WORDS = [
  'calm', 'quiet', 'peace', 'serene', 'still', 'gentle', 'tender', 'warm', 'nostalg', 'soft',
  'hopeful', 'wistful', 'melanch',
]

function moodIntensity(mood: string[], tier: 'still' | 'video'): number {
  let score = 0.45 // neutral-ish baseline
  for (const raw of mood) {
    const w = raw.toLowerCase()
    if (TENSE_WORDS.some((k) => w.includes(k))) score += 0.22
    else if (CALM_WORDS.some((k) => w.includes(k))) score -= 0.18
  }
  if (tier === 'video') score += 0.12 // hero beats carry a touch more
  return Math.max(0, Math.min(1, score))
}

export const ReelComposition: React.FC<ReelCompositionProps> = ({
  scenes,
  subtitles,
  captionStyle,
  captionSafeZonePct,
  grain,
  vignette,
}) => {
  const { width, height } = useVideoConfig()

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', width, height }}>
      {/* Scene clips — each in its own Sequence so Remotion handles the timeline */}
      {scenes.map((scene) => (
        <Sequence
          key={scene.idx}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          <AbsoluteFill>
            <SceneClip
              imageSrc={scene.imageSrc}
              videoSrc={scene.videoSrc}
              tier={scene.tier}
              durationFrames={scene.durationFrames}
              idx={scene.idx}
            />
            {/* Per-scene grade — atmosphere intensity scales with THIS scene's mood + tier */}
            <GradeOverlay grain={grain} vignette={vignette} intensity={moodIntensity(scene.mood, scene.tier)} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Burned-in subtitles — always on top of all scenes + their grade */}
      <SubtitleOverlay subtitles={subtitles} captionStyle={captionStyle} safeZonePct={captionSafeZonePct} />
    </AbsoluteFill>
  )
}
