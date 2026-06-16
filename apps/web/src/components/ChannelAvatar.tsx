// Channel avatar: the uploaded image if present, otherwise a deterministic
// gradient monogram so every channel has a distinct, intentional default.
// Pure render (no hooks) so it works in server components too.

const GRADIENTS: Array<[string, string]> = [
  ['#6366F1', '#8B5CF6'], // indigo→violet
  ['#0EA5E9', '#6366F1'], // sky→indigo
  ['#EC4899', '#F43F5E'], // pink→rose
  ['#F59E0B', '#EF4444'], // amber→red
  ['#10B981', '#0EA5E9'], // emerald→sky
  ['#8B5CF6', '#EC4899'], // violet→pink
  ['#14B8A6', '#22C55E'], // teal→green
  ['#F43F5E', '#F59E0B'], // rose→amber
]

export function avatarInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

export function avatarGradient(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const [from, to] = GRADIENTS[h % GRADIENTS.length]!
  return `linear-gradient(135deg, ${from}, ${to})`
}

export function ChannelAvatar({
  name,
  avatarKey,
  className = '',
  rounded = 'rounded-lg',
  textClass = 'text-sm',
}: {
  name: string
  avatarKey?: string | null
  className?: string
  rounded?: string
  textClass?: string
}) {
  if (avatarKey) {
    // eslint-disable-next-line @next/next/no-img-element
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
      className={`${className} ${rounded} ${textClass} flex flex-shrink-0 items-center justify-center font-semibold text-white`}
      style={{ background: avatarGradient(name) }}
    >
      {avatarInitials(name)}
    </div>
  )
}
