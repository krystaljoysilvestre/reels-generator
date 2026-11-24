import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

/*
 * Fonts are bundled in ./fonts instead of fetched from Google Fonts at build time, matching the
 * landing site (PR #43). The landing fetch failed in 2 of 5 Vercel builds on 2026-11-24, and this app
 * builds the same way. Files are the Latin subsets from Fontsource 5.3.0 (@fontsource-variable/nunito,
 * @fontsource-variable/mulish, @fontsource/space-mono), under the SIL Open Font License; the licenses
 * sit beside the files.
 */

/** Display — page/story titles, headings, the wordmark. Variable font: covers every weight used (500–900). */
const nunito = localFont({
  src: './fonts/nunito-latin-wght-normal.woff2',
  weight: '200 1000',
  style: 'normal',
  display: 'swap',
  variable: '--font-nunito',
})

/** Body + all UI — Nunito's un-rounded sibling, so it recedes. Variable font (app uses 400–700). */
const mulish = localFont({
  src: './fonts/mulish-latin-wght-normal.woff2',
  weight: '200 1000',
  style: 'normal',
  display: 'swap',
  variable: '--font-mulish',
})

/** Numbers, costs, durations, IDs, scene indices, slate metadata. */
const spaceMono = localFont({
  src: [
    { path: './fonts/space-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/space-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
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
      {/* Marketing analytics live on the landing site. This app handles private stories and
          bearer recovery links; persistent third-party history listeners must not see them. */}
      <body>{children}</body>
    </html>
  )
}
