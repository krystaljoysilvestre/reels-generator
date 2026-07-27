'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Wordmark } from '@/components/Wordmark'

type Item = { href: string; label: string; icon: (active: boolean) => React.ReactNode; match: string }

// Active nav icons are stroked with the brand gradient; resting ones sit in `faint`.
const STROKE = (active: boolean) => (active ? 'url(#nav-gradient)' : '#9B96A8')

const items: Item[] = [
  {
    href: '/dashboard',
    label: 'Channels',
    match: '/dashboard',
    icon: (active) => (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={STROKE(active)} strokeWidth={active ? 1.9 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M7 5V3M17 5V3" />
      </svg>
    ),
  },
]

const ADMIN_ITEM: Item = {
  href: '/admin',
  label: 'Admin',
  match: '/admin',
  icon: (active) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={STROKE(active)} strokeWidth={active ? 1.9 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 4v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V7l7-4Z" />
    </svg>
  ),
}

// First + last initial ("Krystal Joy Silvestre" → KS); falls back to the first two characters for
// single-word labels like an email address.
function initialsFrom(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'AC'
  const first = words[0]!
  const second = words.length > 1 ? words[words.length - 1]! : first.slice(1)
  return ((first[0] ?? '') + (second[0] ?? '')).toUpperCase()
}

/** The signed-in operator's photo, with the gradient initials tile as the fallback. */
export function Avatar({
  label,
  image,
  size,
  textClass,
}: {
  label: string
  image?: string | null | undefined
  size: number
  textClass: string
}) {
  const [failed, setFailed] = useState(false)
  const box = { width: size, height: size }

  // A plain <img>, not next/image: provider avatar hosts change (Google, and whatever we add next),
  // and each one would otherwise need a remotePatterns entry in next.config before it would render.
  if (image && !failed) {
    return (
      <img
        src={image}
        alt=""
        style={box}
        // Google's lh3 CDN refuses hotlinked avatars when a referrer is attached.
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="flex-shrink-0 rounded-sm object-cover"
      />
    )
  }
  return (
    <div
      style={box}
      className={`flex flex-shrink-0 items-center justify-center rounded-sm bg-pair-blue-purple font-700 text-white ${textClass}`}
    >
      {initialsFrom(label)}
    </div>
  )
}

export function Sidebar({
  onNavigate,
  isAdmin = false,
  userLabel = 'Account',
  userImage,
}: {
  onNavigate?: () => void
  isAdmin?: boolean
  userLabel?: string
  userImage?: string | null | undefined
}) {
  const pathname = usePathname()
  const isActive = (match: string) => pathname === match || pathname.startsWith(match + '/')

  const navRow = (item: Item) => {
    const active = isActive(item.match)
    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => onNavigate?.()}
        aria-current={active ? 'page' : undefined}
        className={`nav-link ${active ? 'nav-link-active' : ''}`}
      >
        <span className="flex-shrink-0">{item.icon(active)}</span>
        {item.label}
      </Link>
    )
  }

  return (
    <aside className="flex h-full w-sidebar flex-shrink-0 flex-col border-r border-border bg-surface px-3.5 py-5">
      {/* One shared gradient def for every active nav icon in this sidebar. */}
      <svg width="0" height="0" className="absolute" aria-hidden>
        <defs>
          <linearGradient id="nav-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2FA4FF" />
            <stop offset="0.5" stopColor="#9B3BFF" />
            <stop offset="1" stopColor="#FF2D9B" />
          </linearGradient>
        </defs>
      </svg>

      {/* Logo lockup */}
      <Link href="/dashboard" onClick={() => onNavigate?.()} className="px-2 pb-5 pt-1">
        <Wordmark size={34} textClass="text-[19px]" />
      </Link>

      <p className="micro-label px-2.5 pb-2 pt-1.5">Workspace</p>
      <nav className="flex flex-col gap-0.5">{items.map(navRow)}</nav>

      {isAdmin && (
        <>
          <p className="micro-label px-2.5 pb-2 pt-5">Operations</p>
          <nav className="flex flex-col gap-0.5">{navRow(ADMIN_ITEM)}</nav>
        </>
      )}

      <div className="flex-1" />

      {/* Operator footer */}
      <div className="mt-2 flex items-center gap-2.5 border-t border-border-soft px-1.5 pb-0.5 pt-3">
        <Avatar label={userLabel} image={userImage} size={30} textClass="text-[12px]" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-[13px] font-600 text-ink">{userLabel}</p>
          <p className="truncate text-[11px] text-faint">{isAdmin ? 'Admin' : 'Creator'}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/signin' })}
          aria-label="Sign out"
          title="Sign out"
          className="flex-shrink-0 rounded-sm p-1 text-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
