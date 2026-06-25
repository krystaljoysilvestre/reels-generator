import type { CSSProperties } from 'react'

// A characterful, channel-themed loading glyph: the shape changes with the channel's genre and the color
// with its mood tint. Horror gets a floating ghost, informational a broadcast pulse, lifestyle a twinkling
// sparkle, everything else a breathing orb. All motion is CSS-driven and degrades under the global
// prefers-reduced-motion guard. Decorative only (aria-hidden) — pair with real status text.
export function GenreLoader({
  genre,
  tint,
  size = 44,
  className = '',
}: {
  genre?: string | undefined
  tint: string
  size?: number
  className?: string
}) {
  const g = (genre ?? 'general').toLowerCase()
  const style = { ['--gl-tint']: tint, width: size, height: size } as CSSProperties

  return (
    <span className={`gl ${className}`} style={style} aria-hidden>
      <span className="gl__aura" />
      {g === 'horror' ? (
        <svg className="gl__glyph gl-float" viewBox="0 0 24 24" fill="var(--gl-tint)" aria-hidden>
          {/* ghost body with two cut-out eyes (evenodd holes) */}
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M12 2.4c-4.3 0-7 3.4-7 7.3v9.7c0 .55.66.83 1.05.44l1.3-1.3 1.45 1.4c.23.22.6.22.83 0l1.37-1.36 1.37 1.36c.23.22.6.22.83 0l1.45-1.4 1.3 1.3c.4.4 1.05.11 1.05-.44V9.7c0-3.9-2.7-7.3-7-7.3ZM9.7 9.1a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Zm4.6 0a1.05 1.05 0 1 0 0 2.1 1.05 1.05 0 0 0 0-2.1Z"
          />
        </svg>
      ) : g === 'informational' ? (
        <span className="gl__signal">
          <span className="gl__ring" />
          <span className="gl__ring gl__ring--2" />
          <span className="gl__dot" />
        </span>
      ) : g === 'lifestyle' ? (
        <svg className="gl__glyph gl-twinkle" viewBox="0 0 24 24" fill="var(--gl-tint)" aria-hidden>
          <path d="M12 1.8l1.9 6.4 6.3 1.8-6.3 1.8L12 18.2l-1.9-6.4L3.8 10l6.3-1.8L12 1.8Z" />
        </svg>
      ) : (
        <span className="gl__orb" />
      )}
    </span>
  )
}
