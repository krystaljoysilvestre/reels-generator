'use client'

import type { ReactNode } from 'react'
import { type TargetPlatform, PLATFORM_PRESETS } from '@reels/core'

// Brand-recognizable target-platform picker using the platforms' actual logos. A live line
// below explains what the selection tunes (length, caption safe-zone, aspect). Shared by the
// create wizard (Step 1) and channel Settings.

// TikTok — authentic glitch note (cyan + red offset behind black). simple-icons path (CC0).
const TIKTOK_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.08-.14 1.62.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'

const TikTokIcon = (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <path d={TIKTOK_PATH} fill="#25F4EE" transform="translate(-0.8 -0.8)" />
    <path d={TIKTOK_PATH} fill="#FE2C55" transform="translate(0.8 0.8)" />
    <path d={TIKTOK_PATH} fill="#000000" />
  </svg>
)

// YouTube — red rounded rect with the play as negative space (simple-icons, CC0).
const YouTubeIcon = (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
    <path
      fill="#FF0000"
      d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z"
    />
  </svg>
)

// Facebook — blue circle with the "f" as negative space (simple-icons, CC0).
const FacebookIcon = (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <path
      fill="#1877F2"
      d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
    />
  </svg>
)

// All — the three brand colors overlapping, i.e. "everywhere".
const AllIcon = (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
    <circle cx="9" cy="9.5" r="5.5" fill="#25F4EE" fillOpacity="0.9" />
    <circle cx="15" cy="9.5" r="5.5" fill="#FF0000" fillOpacity="0.8" />
    <circle cx="12" cy="14.5" r="5.5" fill="#1877F2" fillOpacity="0.8" />
  </svg>
)

interface Plat {
  value: TargetPlatform
  label: string
  sub: string
  icon: ReactNode
}

const PLATFORMS: Plat[] = [
  { value: 'tiktok', label: 'TikTok', sub: 'up to 3 min', icon: TikTokIcon },
  { value: 'youtube_shorts', label: 'YouTube Shorts', sub: 'up to 60s', icon: YouTubeIcon },
  { value: 'facebook_reels', label: 'Facebook Reels', sub: 'up to 90s', icon: FacebookIcon },
  { value: 'all', label: 'All platforms', sub: 'safe everywhere', icon: AllIcon },
]

export function PlatformPicker({
  value,
  onChange,
}: {
  value: TargetPlatform
  onChange: (v: TargetPlatform) => void
}) {
  const preset = PLATFORM_PRESETS[value] ?? PLATFORM_PRESETS.all
  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PLATFORMS.map((p) => {
          const selected = value === p.value
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value)}
              aria-pressed={selected}
              className={`group relative flex flex-col items-center gap-2 rounded-xl border bg-surface px-2 py-4 transition-all ${
                selected
                  ? 'border-accent ring-2 ring-accent'
                  : 'border-border-strong hover:border-accent/60 hover:bg-subtle'
              }`}
            >
              <span className="flex h-8 items-center justify-center transition-transform group-hover:scale-110">
                {p.icon}
              </span>
              <span className="text-sm font-medium leading-none text-ink">{p.label}</span>
              <span className="text-[11px] leading-none text-faint">{p.sub}</span>
              {selected && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white shadow-sm">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p className="mt-2.5 text-xs text-muted">
        Up to <span className="font-medium text-ink">{preset.maxSeconds}s</span> · 9:16 vertical · captions kept clear of the {preset.label} UI.
      </p>
    </div>
  )
}
