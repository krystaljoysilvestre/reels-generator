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

// Pages set only their own name; the template appends the brand. Entity-first where a page is
// about one thing ("Batang Bangis · Settings"), so a narrow tab still shows which one it is.
export const metadata: Metadata = {
  title: {
    default: 'Kendrix',
    template: '%s · Kendrix',
  },
  description: 'A storytelling operating system — from an idea to a finished story, guided end to end.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${mulish.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
