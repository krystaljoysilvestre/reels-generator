// The Kendrix brand lockup — the gradient K glyph plus the wordmark in Nunito 800.
// Pure render (no hooks) so it works in server components too.

export function KendrixMark({ size = 34, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/kendrix-k.png"
      alt=""
      width={size}
      height={size}
      className={`block h-auto flex-shrink-0 ${className}`}
      style={{ width: size }}
    />
  )
}

export function Wordmark({
  size = 34,
  className = '',
  textClass = 'text-lg',
  onDark = false,
}: {
  size?: number
  className?: string
  textClass?: string
  onDark?: boolean
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <KendrixMark size={size} />
      <span
        className={`font-display font-800 -tracking-[0.01em] ${textClass} ${onDark ? 'text-white' : 'text-ink'}`}
      >
        Kendrix
      </span>
    </span>
  )
}
