'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Item = { href: string; label: string; icon: React.ReactNode; match: string }

const items: Item[] = [
  {
    href: '/dashboard',
    label: 'Channels',
    match: '/dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M7 5V3M17 5V3" />
      </svg>
    ),
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col gap-1 border-r border-border bg-bg px-3 py-4">
      {/* Operator */}
      <div className="mb-3 flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-ink text-xs font-semibold text-white">
          OP
        </div>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold text-ink">Operator</p>
          <p className="truncate text-xs text-faint">Portfolio</p>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = pathname === item.match || pathname.startsWith(item.match + '/')
          return (
            <Link key={item.label} href={item.href} onClick={() => onNavigate?.()} className={`nav-link ${active ? 'nav-link-active' : ''}`}>
              <span className={active ? 'text-accent' : 'text-faint'}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="flex-1" />

      <form action="/api/logout" method="POST" className="px-1">
        <button className="nav-link w-full" type="submit">
          <span className="text-faint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </span>
          Sign out
        </button>
      </form>
    </aside>
  )
}
