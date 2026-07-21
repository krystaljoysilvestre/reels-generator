'use client'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { ToastProvider } from '@/components/Toast'
import { RenderAlertWatcher } from '@/components/RenderAlertWatcher'

export function Shell({
  children,
  isAdmin = false,
  userLabel = 'Account',
}: {
  children: React.ReactNode
  isAdmin?: boolean
  userLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const initials = userLabel.trim().slice(0, 2).toUpperCase() || 'AC'

  return (
    <ToastProvider>
    {/* App-wide "reel is done" alert — polls on every page so a finished render pings you anywhere. */}
    <RenderAlertWatcher />
    <div className="flex h-screen overflow-hidden bg-bg">
      {/* Desktop sidebar — fixed full-height; only <main> scrolls (see h-screen + overflow-hidden above). */}
      <div className="hidden md:flex">
        <Sidebar isAdmin={isAdmin} userLabel={userLabel} />
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="animate-fade-in absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="animate-slide-in-left absolute left-0 top-0 h-full">
            <Sidebar onNavigate={() => setOpen(false)} isAdmin={isAdmin} userLabel={userLabel} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center gap-2.5 border-b border-border bg-bg/80 px-4 py-2.5 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} className="btn-ghost btn-sm -ml-1.5" aria-label="Open menu">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white">{initials}</div>
          <span className="text-sm font-semibold text-ink">{userLabel}</span>
        </div>

        <main className="flex-1 overflow-y-auto [scrollbar-gutter:stable]">{children}</main>
      </div>
    </div>
    </ToastProvider>
  )
}
