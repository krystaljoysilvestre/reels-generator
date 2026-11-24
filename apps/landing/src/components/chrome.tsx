import Image from 'next/image'
import { landingAccess } from '@/lib/access'

/** Film-leader strip — full slate on desktop, centered ● REC cue on mobile. */
export function MetaStrip() {
  const { open } = landingAccess()
  return (
    <div className="mono relative z-[5] mx-auto flex max-w-[1220px] justify-center px-6 py-3 text-[10.5px] uppercase tracking-[0.14em] text-night-ghost sm:justify-between sm:px-8">
      <span className="hidden sm:inline">Kendrix Studio</span>
      <span className="kx-blink text-brand-pink">{open ? '● REC — free early access' : '● REC — in production · invites soon'}</span>
      <span className="hidden sm:inline">Reel 001 / 2026</span>
    </div>
  )
}

export function Nav() {
  const { open, signinUrl, signupUrl } = landingAccess()
  return (
    <header className="relative z-[5] mx-auto flex max-w-[1220px] flex-wrap items-center gap-4 border-b border-white/[0.08] px-6 pb-5 pt-3.5 sm:px-8">
      <div className="flex items-center gap-[11px]">
        <Image src="/kendrix-k.png" alt="Kendrix" width={32} height={32} className="h-auto w-8" />
        <span className="font-display text-[21px] font-900 tracking-[-0.02em]">Kendrix</span>
      </div>
      <nav className="kx-nav ml-[38px] hidden gap-7 text-sm font-600 text-night-muted lg:flex">
        <a href="#problem">Why</a>
        {/* Plain word on purpose: visitors scan the nav for "demo", not for the section's pun. */}
        <a href="#feature">Demo</a>
        <a href="#how">Process</a>
        <a href="#roadmap">Roadmap</a>
        <a href="#access">Access</a>
      </nav>
      <div className="flex-1" />
      {/* The nav links are desktop-only, so phones and tablets get the demo link here. */}
      <a href="#feature" className="whitespace-nowrap text-sm font-600 text-night-muted hover:text-white lg:hidden">Demo</a>
      <a href={signinUrl} className="whitespace-nowrap text-sm font-600 text-night-muted hover:text-white">Sign in</a>
      {/* Hidden on phones: a button here wrapped the header onto two lines at 360px and below, and the
          hero's primary button carries the same action on the first screen. In invitation mode the
          visitor can only request an invite, so the label says exactly that. */}
      <a
        href={open ? signupUrl : '#access'}
        className="kx-btn hidden items-center gap-2 rounded-[11px] bg-brand-3 px-[18px] py-2.5 text-sm font-700 shadow-[0_10px_26px_-8px_rgba(255,45,155,0.5)] sm:inline-flex"
      >
        {open ? 'Start free' : 'Request an invite'}
      </a>
    </header>
  )
}

export function Footer() {
  const { helpUrl } = landingAccess()
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
      <div className="kx-nav flex flex-wrap gap-[22px] text-[13px] font-600 text-night-dim">
        <a href={helpUrl}>Guide</a>
        <a href="/about">About</a>
        <a href="/privacy">Privacy</a>
        <a href="/terms">Terms</a>
        <a href="/contact">Contact</a>
      </div>
    </footer>
  )
}
