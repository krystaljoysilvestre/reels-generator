/** Inline stroke icons, paths lifted 1:1 from the design prototype. */

type IconProps = {
  size?: number
  stroke?: string
  strokeWidth?: number
}

function base({ size = 15, stroke = 'currentColor', strokeWidth = 1.8 }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function PenIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  )
}

export function BoardIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="4" width="7" height="7" rx="1" />
      <rect x="14" y="4" width="7" height="7" rx="1" />
      <rect x="3" y="15" width="7" height="5" rx="1" />
      <rect x="14" y="15" width="7" height="5" rx="1" />
    </svg>
  )
}

export function MicIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg>
  )
}

export function CameraIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m22 8-6 4 6 4z" />
    </svg>
  )
}

export function HeadphonesIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  )
}

export function SendIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  )
}

export function WandIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M15 4V2M15 16v-2M8 9h2M20 9h2M3 21l9-9M12.2 6.2 11 5" />
    </svg>
  )
}

export function FrameIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

export function CheckIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function AlertIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M12 9v4M12 17h.01" />
    </svg>
  )
}

export function ChartIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M3 3v18h18M8 14l3-3 3 2 4-5" />
    </svg>
  )
}

export function ArrowRightIcon(p: IconProps) {
  return (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

export function PlayIcon({ size = 12, fill = '#fff' }: { size?: number; fill?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}
