import React from 'react'
import { useCurrentFrame, useVideoConfig } from 'remotion'
import type { SubtitleChunk } from '../types.js'

interface SubtitleOverlayProps {
  subtitles: SubtitleChunk[]
}

// Burned-in subtitles — non-optional (most reels watched muted). CLAUDE.md non-negotiable.
export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({ subtitles }) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const currentMs = (frame / fps) * 1000

  const active = subtitles.find((s) => currentMs >= s.startMs && currentMs < s.endMs)
  if (!active) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 120,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        padding: '0 60px',
      }}
    >
      <div
        style={{
          fontFamily: 'Arial, sans-serif',
          fontSize: 52,
          fontWeight: 700,
          color: '#ffffff',
          textAlign: 'center',
          lineHeight: 1.3,
          textShadow: [
            '2px 2px 0 #000',
            '-2px 2px 0 #000',
            '2px -2px 0 #000',
            '-2px -2px 0 #000',
            '0 3px 6px rgba(0,0,0,0.8)',
          ].join(','),
          maxWidth: width - 120,
          wordBreak: 'keep-all',
        }}
      >
        {active.text}
      </div>
    </div>
  )
}
