'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'

type Option = { value: string; label: string; icon?: ReactNode }

export function Dropdown({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  buttonClassName = '',
  icon,
}: {
  value: string
  onChange: (v: string) => void
  options: Array<string | Option>
  placeholder?: string
  className?: string
  buttonClassName?: string
  icon?: ReactNode // leading icon on the trigger (used when an option has no icon of its own)
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const opts: Option[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o))
  const current = opts.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input flex items-center justify-between gap-2 text-left ${buttonClassName}`}
      >
        <span className={`flex min-w-0 items-center gap-2 ${current ? 'text-ink' : 'text-faint'}`}>
          {(current?.icon ?? icon) && <span className="flex-shrink-0">{current?.icon ?? icon}</span>}
          <span className="truncate">{current?.label ?? placeholder}</span>
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden
          className={`flex-shrink-0 text-faint transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="animate-dropdown absolute z-50 mt-1.5 max-h-64 w-full origin-top overflow-auto rounded-lg border border-border bg-surface p-1 shadow-lg">
          {opts.map((o) => {
            const sel = o.value === value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                  sel ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-subtle'
                }`}
              >
                {o.icon && <span className="flex-shrink-0">{o.icon}</span>}
                <span className="flex-1 truncate">{o.label}</span>
                {sel && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
