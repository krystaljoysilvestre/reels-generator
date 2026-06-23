'use client'
import { createContext, useCallback, useContext, useRef, useState } from 'react'

// Lightweight, dependency-free toast for cross-cutting feedback (render queued, approved, published,
// rate-limited, hard errors). Per-element feedback (Saving…/Saved ✓, reshoot overlays) stays inline —
// toasts are for things that happen *to the reel*, not field-level edits. CSS-animated, auto-dismiss,
// stackable, dismissible, announced via aria-live. Degrades cleanly under prefers-reduced-motion.

type ToastVariant = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; variant: ToastVariant }

const ToastCtx = createContext<{ toast: (message: string, variant?: ToastVariant) => void } | null>(null)

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => setItems((s) => s.filter((t) => t.id !== id)), [])
  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = (idRef.current += 1)
    setItems((s) => [...s, { id, message, variant }])
    setTimeout(() => dismiss(id), 4200)
  }, [dismiss])

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

const VARIANT: Record<ToastVariant, { ring: string; icon: string; tint: string; path: React.ReactNode }> = {
  success: {
    ring: 'border-positive/30', icon: 'text-positive', tint: 'bg-positive-soft',
    path: <path d="M20 6 9 17l-5-5" />,
  },
  error: {
    ring: 'border-danger/30', icon: 'text-danger', tint: 'bg-danger-soft',
    path: <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>,
  },
  info: {
    ring: 'border-border-strong', icon: 'text-accent', tint: 'bg-subtle',
    path: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  },
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const v = VARIANT[item.variant]
  return (
    <div
      role={item.variant === 'error' ? 'alert' : 'status'}
      className={`animate-toast-in pointer-events-auto flex items-start gap-2.5 rounded-xl border ${v.ring} bg-surface px-3.5 py-3 shadow-md`}
    >
      <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${v.tint} ${v.icon}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {v.path}
        </svg>
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug text-ink">{item.message}</p>
      <button onClick={onDismiss} className="-mr-1 -mt-0.5 flex-shrink-0 rounded-md p-1 text-faint transition-colors hover:bg-subtle hover:text-ink" aria-label="Dismiss">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>
  )
}
