import type { Metadata } from 'next'
import { Mulish, Nunito, Space_Mono } from 'next/font/google'
import './globals.css'

/** Display — page/story titles, headings, the wordmark. */
const nunito = Nunito({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
  display: 'swap',
  variable: '--font-nunito',
})

/** Body + all UI — Nunito's un-rounded sibling, so it recedes. */
const mulish = Mulish({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-mulish',
})

/** Numbers, costs, durations, IDs, scene indices, slate metadata. */
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  title: 'Reels — Operator',
  description: 'AI reel generator — operator pipeline',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${mulish.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
