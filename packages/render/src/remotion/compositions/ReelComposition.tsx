import React from 'react'
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion'
import { SceneClip } from '../components/SceneClip.js'
import { SceneEffects } from '../components/SceneEffects.js'
import { CaptionFonts, SubtitleOverlay } from '../components/SubtitleOverlay.js'
import { GradeOverlay } from '../components/GradeOverlay.js'
import { OnScreenTextOverlay } from '../components/OnScreenTextOverlay.js'
import { WatermarkOverlay } from '../components/WatermarkOverlay.js'
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
  watermark,
  disclosure,
}) => {
  const { width, height } = useVideoConfig()

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', width, height }}>
      {/* The caption typefaces, blocked on before frame 0. Mounted for the whole composition,
          not inside the overlay, which unmounts between chunks. */}
      {captionStyle.enabled === false ? null : <CaptionFonts />}

      {/* Scene clips — each in its own Sequence so Remotion handles the timeline */}
      {scenes.map((scene) => (
        <Sequence
          key={scene.idx}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          <AbsoluteFill>
            {/* Per-scene video effects (zoom/shake/glitch/flash/vhs) wrap the clip + add overlays */}
            <SceneEffects effects={scene.effects} durationFrames={scene.durationFrames}>
              <SceneClip
                imageSrc={scene.imageSrc}
                videoSrc={scene.videoSrc}
                tier={scene.tier}
                durationFrames={scene.durationFrames}
                idx={scene.idx}
                cameraMove={scene.cameraMove}
                videoDurationSec={scene.videoDurationSec}
              />
            </SceneEffects>
            {/* Per-scene grade — atmosphere intensity scales with THIS scene's mood + tier */}
            <GradeOverlay grain={grain} vignette={vignette} intensity={moodIntensity(scene.mood, scene.tier)} />
            {/* Optional per-scene on-screen text (above the grade, below the global captions) */}
            {scene.onScreenText ? <OnScreenTextOverlay text={scene.onScreenText} /> : null}
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Burned-in subtitles — always on top of all scenes + their grade */}
      <SubtitleOverlay subtitles={subtitles} captionStyle={captionStyle} safeZonePct={captionSafeZonePct} />

      {/* Roaming channel watermark — topmost, full duration; hops position so it can't be cropped out */}
      {watermark ? <WatermarkOverlay dataUri={watermark.dataUri} opacity={watermark.opacity} /> : null}

      {/* Synthetic-media / illustration disclosure — persistent, full-duration, top-center so it clears
          the bottom caption band. Set for Evidence-Based Narrative reels (specs/evidence-based-narrative.md):
          all EBN visuals are illustration, and the label makes that explicit to the viewer. */}
      {disclosure ? (
        <AbsoluteFill style={{ justifyContent: 'flex-start', alignItems: 'center', pointerEvents: 'none' }}>
          <div
            style={{
              marginTop: height * 0.03,
              padding: `${Math.round(height * 0.006)}px ${Math.round(width * 0.03)}px`,
              borderRadius: Math.round(width * 0.012),
              background: 'rgba(0,0,0,0.55)',
              color: 'rgba(255,255,255,0.92)',
              fontSize: Math.round(width * 0.026),
              fontFamily: 'sans-serif',
              letterSpacing: 0.3,
              whiteSpace: 'nowrap',
            }}
          >
            {disclosure}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  )
}
