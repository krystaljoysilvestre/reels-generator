import Image from 'next/image'

/** Film-leader strip — full slate on desktop, centered ● REC cue on mobile. */
export function MetaStrip() {
  return (
    <div className="mono relative z-[5] mx-auto flex max-w-[1220px] justify-center px-6 py-3 text-[10.5px] uppercase tracking-[0.14em] text-night-ghost sm:justify-between sm:px-8">
      <span className="hidden sm:inline">Kendrix Studio</span>
      <span className="kx-blink text-brand-pink">● REC — in production · invites soon</span>
      <span className="hidden sm:inline">Reel 001 / 2026</span>
    </div>
  )
}

export function Nav() {
  return (
    <header className="relative z-[5] mx-auto flex max-w-[1220px] items-center gap-4 border-b border-white/[0.08] px-6 pb-5 pt-3.5 sm:px-8">
      <div className="flex items-center gap-[11px]">
        <Image src="/kendrix-k.png" alt="Kendrix" width={32} height={32} className="h-auto w-8" />
        <span className="font-display text-[21px] font-900 tracking-[-0.02em]">Kendrix</span>
      </div>
      <nav className="kx-nav ml-[38px] hidden gap-7 text-sm font-600 text-night-muted lg:flex">
        <a href="#problem">Why</a>
        <a href="#feature">The cut</a>
        <a href="#how">Process</a>
        <a href="#roadmap">Roadmap</a>
        <a href="#access">Access</a>
      </nav>
      <div className="flex-1" />
      <a
        href="#access"
        className="kx-btn inline-flex items-center gap-2 rounded-[11px] bg-brand-3 px-[18px] py-2.5 text-sm font-700 shadow-[0_10px_26px_-8px_rgba(255,45,155,0.5)]"
      >
        Get access
      </a>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="relative z-[2] mx-auto flex max-w-[1220px] flex-wrap items-center gap-4 border-t border-white/[0.07] px-6 pb-11 pt-7 sm:px-8">
      <div className="flex items-center gap-2.5">
        <Image src="/kendrix-k.png" alt="Kendrix" width={24} height={24} className="h-auto w-6" />
        <span className="font-display text-base font-900">Kendrix</span>
      </div>
      <span className="mono text-[11px] tracking-[0.06em] text-night-ghost">
        © 2026 · STORYTELLING STUDIO
      </span>
      <div className="flex-1" />
      <div className="kx-nav flex gap-[22px] text-[13px] font-600 text-night-dim">
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/contact">Contact</a>
      </div>
    </footer>
  )
}
