import type { Metadata } from 'next'
import { Mulish, Nunito, Space_Mono } from 'next/font/google'
import './globals.css'

/** Display — headings and the wordmark. */
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

/** Timecodes, slate metadata, micro-labels. */
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://kendrix.io'),
  title: 'Kendrix — Roll a single idea. Cut a finished reel.',
  description:
    'Kendrix writes, storyboards, shoots, scores and ships publish-ready vertical video — a full studio crew, condensed into one prompt.',
  icons: { icon: '/kendrix-k.png' },
  openGraph: {
    title: 'Kendrix — Roll a single idea. Cut a finished reel.',
    description:
      'Kendrix writes, storyboards, shoots, scores and ships publish-ready vertical video — a full studio crew, condensed into one prompt.',
    url: 'https://kendrix.io',
    siteName: 'Kendrix',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${mulish.variable} ${spaceMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
