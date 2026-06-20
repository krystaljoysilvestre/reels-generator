'use client'
import { useEffect, useState } from 'react'

// Types `text` in character by character with a blinking caret. Under prefers-reduced-motion it shows the
// full text immediately (no caret). Used for the story title's "it writes itself" reveal.
export function Typewriter({ text, speedMs = 26, className = '' }: { text: string; speedMs?: number; className?: string }) {
  const [n, setN] = useState(0)

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setN(text.length)
      return
    }
    setN(0)
    const t = setInterval(() => {
      setN((p) => {
        if (p >= text.length) {
          clearInterval(t)
          return p
        }
        return p + 1
      })
    }, speedMs)
    return () => clearInterval(t)
  }, [text, speedMs])

  const done = n >= text.length
  return (
    <span className={className}>
      {text.slice(0, n)}
      {!done && <span className="caret-blink" aria-hidden>▍</span>}
    </span>
  )
}
