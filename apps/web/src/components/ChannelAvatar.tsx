// Channel avatar: the uploaded image if present, otherwise a deterministic
// gradient monogram so every channel has a distinct, intentional default.
// Pure render (no hooks) so it works in server components too.

// The brand's four accent pairs — every monogram stays inside the Kendrix gradient.
const GRADIENTS: Array<[string, string]> = [
  ['#9B3BFF', '#FF2D9B'], // purple→pink
  ['#2FA4FF', '#9B3BFF'], // blue→purple
  ['#2FA4FF', '#7B5BFF'], // blue→violet
  ['#FF2D9B', '#FF9A3D'], // pink→orange
]

export function avatarInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

function pairFor(name: string): [string, string] {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return GRADIENTS[h % GRADIENTS.length]!
}

export function avatarGradient(name: string): string {
  const [from, to] = pairFor(name)
  return `linear-gradient(135deg, ${from}, ${to})`
}

/** The channel's tint as a translucent colour — for the card's corner glow,
 *  so the glow and the monogram always agree. Pair with `--card-glow`. */
export function avatarGlow(name: string, alpha = 0.16): string {
  const [from] = pairFor(name)
  const n = parseInt(from.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export function ChannelAvatar({
  name,
  avatarKey,
  className = '',
  rounded = 'rounded-sm',
  textClass = 'text-sm',
}: {
  name: string
  avatarKey?: string | null
  className?: string
  rounded?: string
  textClass?: string
}) {
  if (avatarKey) {
    return (
      <img
        src={`/api/asset?key=${encodeURIComponent(avatarKey)}`}
        alt=""
        className={`${className} ${rounded} flex-shrink-0 object-cover`}
      />
    )
  }
  return (
    <div
      className={`${className} ${rounded} ${textClass} flex flex-shrink-0 items-center justify-center font-700 text-white`}
      style={{ background: avatarGradient(name) }}
    >
      {avatarInitials(name)}
    </div>
  )
}
