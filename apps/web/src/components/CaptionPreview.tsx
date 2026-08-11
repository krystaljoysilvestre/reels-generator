'use client'

import { useEffect, useRef, useState } from 'react'
import type { CaptionStyle } from '@reels/core'
import { pickEmphasis } from '@reels/core/timings/emphasis'

// Animated, looping caption preview — simulates how the burned-in captions actually
// play in the finished reel (word-by-word, with the preset's signature motion). The
// motion rules here mirror the Remotion SubtitleOverlay so what the operator sees in
// the wizard is what ships in the video.

interface CaptionPreviewProps {
  style: CaptionStyle
  text?: string
  /** Maps 1080×1920 font px → preview px. */
  scale?: number
  /** Selected channel style image — shown behind the captions so the operator sees them over real footage. */
  backgroundImageUrl?: string | undefined
  /** Platform caption safe-zone (% of frame height kept clear of the platform UI). Offsets the caption band. */
  safeZonePct?: number
  className?: string
}

const DEFAULT_TEXT = 'you need to see this'
const WORD_MS = 360 // time each word "speaks"
const ANIM_MS = 280 // entrance duration of a word
const HOLD_MS = 1200 // pause on the full line before looping

const easeOutBack = (t: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)

// Kept in lockstep with SubtitleOverlay.shadowCss — same ratios, same alpha. If the preview
// and the renderer disagree here, the creator approves one look and ships another.
function shadowCss(style: CaptionStyle, fs: number): string {
  const alpha = style.shadowAlpha ?? 0.45
  switch (style.shadow) {
    case 'none':
      return 'none'
    case 'soft':
    case 'glow': // the glow belongs to the accent word, not the line
      return `0 ${Math.max(1, Math.round(fs * 0.07))}px ${Math.round(fs * 0.32)}px rgba(0,0,0,${alpha})`
    case 'hard':
    default: {
      const d = Math.max(1, Math.round(fs * 0.05))
      // Single crisp drop shadow. The WebkitTextStroke already draws the outline, so a
      // 4-direction offset would render as a doubled black "ghost" behind the text.
      return `${d}px ${d}px 0 rgba(0,0,0,0.85)`
    }
  }
}

function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const h = m[1]!
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function glowCss(accent: string, fs: number): string {
  return `0 0 ${Math.round(fs * 0.41)}px ${withAlpha(accent, 0.75)}, 0 0 ${Math.round(fs * 0.9)}px ${withAlpha(accent, 0.4)}`
}

// The lift under gradient type. Accent-tinted at the design's own shadow value; black once the
// legibility pass has raised it, because a tinted halo cannot separate pale type from a lit wall.
function gradientLift(style: CaptionStyle): string {
  const alpha = style.shadowAlpha ?? 0.45
  return alpha > 0.45
    ? `rgba(0,0,0,${Math.min(0.9, alpha)})`
    : withAlpha(style.highlightColor, 0.35)
}

// The same guttering curve the renderer uses — see SubtitleOverlay.flickerOpacity.
const FLICKER_STOPS: [number, number][] = [[0, 1], [0.44, 0.84], [0.47, 1], [0.91, 0.9], [0.93, 1], [1, 1]]
function flickerOpacity(ms: number): number {
  const t = (ms % 4500) / 4500
  for (let i = 1; i < FLICKER_STOPS.length; i++) {
    const [t1, v1] = FLICKER_STOPS[i]!
    const [t0, v0] = FLICKER_STOPS[i - 1]!
    if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0))
  }
  return 1
}

export function CaptionPreview({ style, text = DEFAULT_TEXT, scale = 0.42, backgroundImageUrl, safeZonePct = 0, className }: CaptionPreviewProps) {
  const words = text.trim().split(/\s+/)
  const cycle = words.length * WORD_MS + HOLD_MS
  const [now, setNow] = useState(0)
  const startRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts
      setNow((ts - startRef.current) % cycle)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      startRef.current = null
    }
  }, [cycle])

  const fontSize = Math.round(style.fontSizePx * scale)
  // No fudge factor: the stroke scales exactly as the type does, so what the creator judges
  // here is the ratio the renderer burns.
  const strokeW = style.stroke.widthPx ? Math.max(1, Math.round(style.stroke.widthPx * scale)) : 0
  const activeIdx = Math.min(words.length - 1, Math.floor(now / WORD_MS))
  // Same rule as the renderer. Every synthetic word here is given the same duration, so
  // pickEmphasis falls through to its letter-count tie-break and lands on the longest word,
  // which is the sensible stand-in for a preview with no real delivery behind it.
  const accentIdx = pickEmphasis(words.map((text, i) => ({ text, startMs: i * WORD_MS, endMs: i * WORD_MS + WORD_MS })))

  const baseText: React.CSSProperties = {
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.italic ? 'italic' : 'normal',
    fontSize,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.letterSpacingEm}em`,
    textTransform: style.uppercase ? 'uppercase' : 'none',
    color: style.color,
    textShadow: shadowCss(style, fontSize),
    WebkitTextStrokeWidth: strokeW ? `${strokeW}px` : undefined,
    WebkitTextStrokeColor: strokeW ? style.stroke.color : undefined,
    paintOrder: 'stroke fill',
  }

  // Gradient text fill (chrome) — clip a gradient to the glyphs. A text-shadow would paint
  // as a dark ghost behind the transparent fill, so the lift is a drop-shadow on the wrapper.
  if (style.gradient) {
    const { from, to, mid, midStop } = style.gradient
    const stops = mid ? `${from}, ${mid} ${midStop ?? 45}%, ${to}` : `${from}, ${to}`
    baseText.backgroundImage = `linear-gradient(180deg, ${stops})`
    baseText.WebkitBackgroundClip = 'text'
    baseText.backgroundClip = 'text'
    baseText.WebkitTextFillColor = 'transparent'
    baseText.color = 'transparent'
    baseText.textShadow = 'none'
  }

  // ── Block animations (fade, typewriter, flicker) ─────────────────────────
  const isBlock = style.mode === 'block' || style.animation === 'fade' ||
    style.animation === 'typewriter' || style.animation === 'flicker'

  let content: React.ReactNode
  if (style.animation === 'flicker') {
    // seance marks one word even though the reveal is block-level, so the line is laid out per
    // word when the preset asks for it. Matches SubtitleOverlay.blockWords.
    content = (
      <span style={{ ...baseText, opacity: clamp01(now / 700) * flickerOpacity(now) }}>
        {style.accentWord
          ? words.map((w, i) => (
              <span key={i} style={i === accentIdx ? { color: style.highlightColor } : undefined}>
                {i > 0 ? ' ' : ''}{w}
              </span>
            ))
          : words.join(' ')}
      </span>
    )
  } else if (style.animation === 'typewriter') {
    const full = words.join(' ')
    const revealMs = words.length * WORD_MS
    const chars = Math.round(clamp01(now / revealMs) * full.length)
    const cursorOn = now % 900 < 470
    content = (
      <span style={baseText}>
        {full.slice(0, chars)}
        <span style={{ color: style.highlightColor, opacity: cursorOn ? 1 : 0 }}>▌</span>
      </span>
    )
  } else if (isBlock) {
    const t = clamp01(now / 480)
    content = (
      <span
        style={{
          ...baseText,
          opacity: t,
          transform: `translateY(${Math.round((1 - easeOutCubic(t)) * 14)}px)`,
        }}
      >
        {words.join(' ')}
      </span>
    )
  } else {
    // ── Word animations (pop, bounce, punch, karaoke, highlight_box) ────────
    content = (
      <span style={{ ...baseText, display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: `0 ${Math.round(fontSize * 0.28)}px` }}>
        {words.map((w, i) => {
          const started = now >= i * WORD_MS
          const t = clamp01((now - i * WORD_MS) / ANIM_MS)
          const isActive = i === activeIdx
          const isSpoken = i <= activeIdx
          const isAccent = i === accentIdx && started
          // The accent carries more than colour for some presets — sable italicises it, kick
          // sets its punchline larger. Same rule as the renderer.
          const accentExtra: React.CSSProperties = isAccent
            ? {
                ...(style.accentItalic ? { fontStyle: 'italic' } : {}),
                ...(style.accentScale ? { fontSize: Math.round(fontSize * style.accentScale) } : {}),
              }
            : {}

          let transform = 'none'
          let opacity = 1
          let color = style.color
          const wrap: React.CSSProperties = {}

          if (style.animation === 'pop' || style.animation === 'bounce') {
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.62 + 0.38 * easeOutBack(t) : 0.62
            const yV = style.animation === 'bounce' ? (1 - easeOutBack(t)) * -fontSize * 0.5 : 0
            transform = `translateY(${started ? yV : -fontSize * 0.5}px) scale(${scaleV})`
            color = isAccent ? style.highlightColor : style.color
            if (style.shadow === 'glow' && isAccent) wrap.textShadow = glowCss(style.highlightColor, fontSize)
          } else if (style.animation === 'punch') {
            opacity = started ? clamp01(t * 2) : 0
            const scaleV = started ? 1 + (1 - easeOutCubic(t)) * 0.55 : 1.55
            const shake = isActive ? Math.sin(now / 32) * (1 - t) * 2.5 : 0
            transform = `scale(${scaleV}) rotate(${shake}deg)`
            color = isAccent ? style.highlightColor : style.color
          } else if (style.animation === 'rise') {
            opacity = started ? clamp01(t * 1.5) : 0
            const yV = started ? (1 - easeOutCubic(t)) * fontSize * 0.28 : fontSize * 0.28
            transform = `translateY(${yV}px)`
            color = isAccent ? style.highlightColor : style.color
          } else if (style.animation === 'karaoke') {
            // Sung words return to the base colour; only the word being sung takes the accent
            // and the underline sweep. Matches SubtitleOverlay.
            color = isActive ? style.highlightColor : style.color
            opacity = isSpoken ? 1 : 0.38
            if (isActive) {
              const sweep = clamp01((now - i * WORD_MS) / 260)
              Object.assign(wrap, {
                backgroundImage: `linear-gradient(${style.highlightColor}, ${style.highlightColor})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0 100%',
                backgroundSize: `${Math.round(sweep * 100)}% ${Math.max(1, Math.round(fontSize * 0.055))}px`,
              })
            }
          } else if (style.animation === 'highlight_box') {
            opacity = 1
            if (isAccent) {
              color = style.activeColor
              Object.assign(wrap, {
                backgroundColor: style.highlightColor,
                borderRadius: `${Math.round(fontSize * 0.33)}px`,
                padding: `${Math.round(fontSize * 0.07)}px ${Math.round(fontSize * 0.4)}px ${Math.round(fontSize * 0.13)}px`,
                transform: `scale(${0.9 + 0.1 * easeOutBack(clamp01((now - i * WORD_MS) / 180))})`,
                WebkitTextStrokeWidth: 0,
                textShadow: 'none',
              })
            } else {
              color = style.color
            }
          } else if (style.animation === 'comic') {
            // Playful "thrown-in" tilt that settles to flat (0°) so resting text stays readable.
            opacity = started ? clamp01(t * 1.6) : 0
            const scaleV = started ? 0.6 + 0.4 * easeOutBack(t) : 0.6
            const tilt = (i % 2 === 0 ? -1 : 1) * 8 * (1 - easeOutCubic(t))
            transform = `rotate(${tilt}deg) scale(${scaleV})`
            color = isAccent ? style.highlightColor : style.color
          } else if (style.animation === 'marker') {
            // A highlighter swipe under the takeaway: it marks the word the line lands on,
            // swiping in as that word is said and staying, the way you highlight a book.
            opacity = 1
            const marked = isAccent
            color = marked ? style.activeColor : style.color
            if (marked) {
              const wipe = isActive ? clamp01((now - i * WORD_MS) / 220) : 1
              Object.assign(wrap, {
                backgroundImage: `linear-gradient(${style.highlightColor}, ${style.highlightColor})`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: '0 90%',
                backgroundSize: `${Math.round(wipe * 100)}% 42%`,
                borderRadius: '2px',
                padding: `0 ${Math.round(fontSize * 0.11)}px`,
                textShadow: 'none',
              })
            }
          } else if (style.animation === 'glitch') {
            opacity = started ? clamp01(t * 2) : 0
            color = style.color
            if (isAccent) {
              const off = Math.sin(now / 90) > 0 ? Math.round(fontSize * 0.05) : -Math.round(fontSize * 0.07)
              wrap.textShadow = `${off}px 0 rgba(240,128,107,0.85), ${-off}px 0 ${withAlpha(style.highlightColor, 0.85)}`
            }
          }

          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                color,
                opacity,
                transform,
                transformOrigin: 'center bottom',
                willChange: 'transform, opacity',
                ...accentExtra,
                ...wrap,
              }}
            >
              {w}
            </span>
          )
        })}
      </span>
    )
  }

  // Optional panel behind the line: translucent dark bar (cinematic/terminal) or a solid
  // accent lower-third (breaking news).
  const plate: React.CSSProperties =
    style.backplate === 'bar'
      ? {
          background: 'rgba(10,14,18,0.62)',
          borderLeft: `${Math.max(2, Math.round(fontSize * 0.105))}px solid ${style.highlightColor}`,
          padding: `${Math.round(fontSize * 0.53)}px ${Math.round(fontSize * 0.74)}px`,
          borderRadius: Math.round(fontSize * 0.21),
        }
      : style.backplate === 'block'
        ? {
            background: 'rgba(12,14,17,0.82)',
            borderTop: `${Math.max(2, Math.round(fontSize * 0.03))}px solid ${style.highlightColor}`,
            padding: `${Math.round(fontSize * 0.52)}px ${Math.round(fontSize * 0.78)}px ${Math.round(fontSize * 0.61)}px`,
          }
        : {}

  const hasBg = !!backgroundImageUrl
  // The stage is 9:16 — the shape that actually publishes. It used to be 16:10, a frame no
  // platform uses, so line breaks and placement here never matched the video.
  //
  // The band is ABSOLUTELY positioned rather than flex-padded, because a percentage padding
  // resolves against the container's WIDTH while the safe zone is a percentage of HEIGHT —
  // on a 9:16 stage that silently under-insets every caption by nearly half. `top`/`bottom`
  // percentages on an absolutely positioned box resolve against height, like the renderer's.
  const safePct = safeZonePct > 0 ? safeZonePct : 12.5
  const insetPct = style.position === 'bottom' ? Math.max(safePct, style.bottomInsetPct ?? 0) : safePct
  const band: React.CSSProperties =
    style.position === 'top' ? { top: `${insetPct}%`, alignItems: 'flex-start' }
      : style.position === 'center' ? { top: 0, bottom: 0, alignItems: 'center' }
        : { bottom: `${insetPct}%`, alignItems: 'flex-end' }
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 12,
        // Dim "video frame" so light captions read like they would over footage.
        background: hasBg ? '#0a0b0e' : 'radial-gradient(120% 80% at 50% 0%, #2a2f3a 0%, #15171d 55%, #0a0b0e 100%)',
        aspectRatio: '9 / 16',
        textAlign: 'center',
      }}
    >
      {/* Selected channel style image — the real footage the captions sit over. */}
      {hasBg && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `url("${backgroundImageUrl}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {/* A wash over the picture with no visible edge, not a box around the words. Its shape
          follows the caption — bottom captions get the design's upward wash, a centred one gets a
          band feathered at both ends, because a bottom wash would darken empty picture instead.
          Matches SubtitleOverlay.scrimStyle. */}
      {style.backplate === 'scrim' && (() => {
        const pct = style.scrimPct ?? 46
        const solid = `rgba(0,0,0,${style.scrimAlpha ?? 0.62})`
        const clear = 'rgba(0,0,0,0)'
        const place: React.CSSProperties =
          style.position === 'center'
            ? { top: 0, bottom: 0, background: `radial-gradient(ellipse 58% ${Math.round(pct * 0.55)}% at 50% 50%, ${solid}, ${clear} 66%)` }
            : style.position === 'top'
              ? { top: 0, height: `${pct}%`, background: `linear-gradient(180deg, ${solid}, ${clear})` }
              : { bottom: 0, height: `${pct}%`, background: `linear-gradient(180deg, ${clear}, ${solid})` }
        return <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, pointerEvents: 'none', ...place }} />
      })()}
      {/* Legibility scrim over the footage (darker toward the caption band). */}
      {hasBg && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'linear-gradient(to top, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.18) 45%, rgba(0,0,0,0.42) 100%)',
          }}
        />
      )}
      {/* faint vignette + grain so it feels like real footage, not a swatch */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 60px 12px rgba(0,0,0,0.55)',
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 width=%2740%27 height=%2740%27><filter id=%27n%27><feTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%272%27/></filter><rect width=%2740%27 height=%2740%27 filter=%27url(%23n)%27 opacity=%270.04%27/></svg>")',
        }}
      />
      {/* The caption band, placed exactly as the renderer places it. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          zIndex: 1,
          display: 'flex',
          justifyContent: style.backplate === 'bar' ? 'flex-start' : 'center',
          padding: style.backplate === 'block' ? 0 : '0 5.6%',
          ...band,
        }}
      >
        <div style={{ transform: `rotate(${style.rotationDeg}deg)`, maxWidth: '100%', width: style.backplate === 'block' ? '100%' : undefined }}>
          {/* A block container, so text-align and max-width actually apply — on an inline span
              (as this was) CSS ignores both, and any caption that wrapped went flush left. */}
          <div
            style={{
              ...plate,
              textAlign: style.backplate === 'block' || style.backplate === 'bar' ? 'left' : 'center',
              ...(style.gradient
                ? { filter: `drop-shadow(0 ${Math.round(fontSize * 0.07)}px ${Math.round(fontSize * 0.32)}px ${gradientLift(style)})` }
                : {}),
            }}
          >
            {content}
          </div>
        </div>
      </div>
    </div>
  )
}
