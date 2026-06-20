'use client'
import { useEffect, useState } from 'react'

// Cycles through "what's happening" lines so the operator always sees activity. The fade between lines is
// CSS (killed by the global reduced-motion guard), but the TEXT keeps rotating either way — motion is the
// only thing that degrades, never the information.
export function StatusTicker({ lines, intervalMs = 2400, className = '' }: { lines: string[]; intervalMs?: number; className?: string }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    if (lines.length <= 1) return
    const t = setInterval(() => setI((p) => (p + 1) % lines.length), intervalMs)
    return () => clearInterval(t)
  }, [lines.length, intervalMs])

  return (
    <p key={i} className={`animate-fade-in ${className}`}>
      {lines[i] ?? lines[0] ?? ''}
    </p>
  )
}
