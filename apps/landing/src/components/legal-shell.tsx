import Image from 'next/image'
import Link from 'next/link'

/** Shared chrome for the fine-print pages (Privacy / Terms / Contact).
 *  Same dark marketing world as the landing, narrowed to a reading column. */

const TABS = [
  { href: '/about', label: 'About' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
  { href: '/contact', label: 'Contact' },
] as const

export type LegalTab = (typeof TABS)[number]['label']

export function LegalShell({
  active,
  title,
  stamp,
  eyebrow = 'The fine print · legal & contact',
  wide = false,
  children,
}: {
  active: LegalTab
  title: string
  /** Mono line under the title, e.g. "LAST UPDATED · AUG 2026 · INVITE-ONLY BETA". */
  stamp: string
  /** Overridable because /about shares this chrome but is not fine print. */
  eyebrow?: string
  /** Contact uses a slightly wider column for its two-panel layout. */
  wide?: boolean
  children: React.ReactNode
}) {
  const column = wide ? 'max-w-[900px]' : 'max-w-[820px]'

  return (
    <div className="relative min-h-screen overflow-hidden bg-night">
      {/* ambient light-leaks + film grain */}
      <div className="kx-leak pointer-events-none absolute -right-[140px] -top-[200px] h-[760px] w-[760px] rounded-full bg-[radial-gradient(circle,rgba(155,59,255,0.16),transparent_62%)]" />
      <div className="kx-leak pointer-events-none absolute -left-[260px] top-[300px] h-[720px] w-[720px] rounded-full bg-[radial-gradient(circle,rgba(47,164,255,0.12),transparent_62%)] [animation-delay:-5s]" />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] mix-blend-soft-light"
        xmlns="http://www.w3.org/2000/svg"
      >
        <filter id="kx-grain-legal">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#kx-grain-legal)" />
      </svg>

      <header className="relative z-[5] mx-auto flex max-w-[1000px] items-center gap-4 border-b border-white/[0.08] px-6 py-[18px] sm:px-8">
        <Link href="/" className="flex items-center gap-[11px]">
          <Image src="/kendrix-k.png" alt="Kendrix" width={30} height={30} className="h-auto w-[30px]" />
          <span className="font-display text-xl font-900 tracking-[-0.02em]">Kendrix</span>
        </Link>
        <div className="flex-1" />
        <Link
          href="/"
          className="mono text-xs tracking-[0.1em] text-night-muted transition-colors hover:text-white"
        >
          ← BACK TO SITE
        </Link>
      </header>

      <div className={`relative z-[3] mx-auto ${column} px-6 pt-[52px] text-center sm:px-8`}>
        <div className="eyebrow tracking-[0.2em]">{eyebrow}</div>
        <h1 className="mt-4 text-4xl font-800 tracking-[-0.03em] sm:text-[44px]">{title}</h1>
        <p className="mono mt-3 text-xs tracking-[0.06em] text-night-ghost">{stamp}</p>
        <div className="mt-[26px] inline-flex gap-[3px] rounded-[13px] border border-white/10 bg-white/[0.04] p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`mono rounded-[10px] px-[18px] py-[9px] text-xs font-700 tracking-[0.04em] transition-colors ${
                tab.label === active
                  ? 'bg-brand-3 text-white'
                  : 'text-night-muted hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      <main
        className={`relative z-[3] mx-auto ${column} px-6 pb-[90px] pt-11 sm:px-8 [&_a]:text-night-lilac [&_a:hover]:text-[#E4CCFF]`}
      >
        {children}
      </main>

      <footer className="relative z-[3] mx-auto flex max-w-[1000px] flex-wrap items-center gap-4 border-t border-white/[0.07] px-6 pb-11 pt-[26px] sm:px-8">
        <div className="flex items-center gap-2.5">
          <Image src="/kendrix-k.png" alt="Kendrix" width={22} height={22} className="h-auto w-[22px]" />
          <span className="font-display text-[15px] font-900">Kendrix</span>
        </div>
        <span className="mono text-[11px] tracking-[0.06em] text-night-ghost">
          © 2026 · STORYTELLING STUDIO
        </span>
        <div className="flex-1" />
        <div className="kx-nav flex gap-[22px] text-[13px] font-600 text-night-dim">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={tab.label === active ? '!text-night-lilac' : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  )
}

/* ── Reading-column prose helpers ─────────────────────────────── */

/** Lead paragraph — one register brighter than body copy. */
export function LegalIntro({ children }: { children: React.ReactNode }) {
  return <p className="text-base leading-[1.72] text-night-soft">{children}</p>
}

export function LegalH({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-[34px] text-xl font-800 tracking-[-0.01em]">{children}</h2>
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[15px] leading-[1.72] text-night-body">{children}</p>
}

/** Gradient-dot list item. */
export function LegalLi({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-[7px] pl-5 text-[15px] leading-[1.7] text-night-body before:absolute before:left-[2px] before:top-[11px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[linear-gradient(135deg,#9B3BFF,#FF2D9B)] before:content-['']">
      {children}
    </div>
  )
}
