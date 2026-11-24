import type { Metadata } from 'next'
import localFont from 'next/font/local'
import Script from 'next/script'
import { StructuredData } from '@/components/structured-data'
import { META_DESCRIPTION, META_TITLE, SITE_NAME, SITE_URL } from '@/lib/site'
import './globals.css'

/*
 * Fonts are bundled in ./fonts instead of fetched from Google Fonts at build time. The fetch failed
 * in 2 of 5 Vercel builds on 2026-11-24, failing the production deploy of KDX-001 once. Files are the
 * Latin subsets from Fontsource 5.3.0 (@fontsource-variable/nunito, @fontsource-variable/mulish,
 * @fontsource/space-mono), under the SIL Open Font License; the licenses sit beside the files.
 */

/** Display — headings and the wordmark. Variable font: covers every weight the site uses (500–900). */
const nunito = localFont({
  src: './fonts/nunito-latin-wght-normal.woff2',
  weight: '200 1000',
  style: 'normal',
  display: 'swap',
  variable: '--font-nunito',
})

/** Body + all UI — Nunito's un-rounded sibling, so it recedes. Variable font (site uses 400–700). */
const mulish = localFont({
  src: './fonts/mulish-latin-wght-normal.woff2',
  weight: '200 1000',
  style: 'normal',
  display: 'swap',
  variable: '--font-mulish',
})

/** Timecodes, slate metadata, micro-labels. */
const spaceMono = localFont({
  src: [
    { path: './fonts/space-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/space-mono-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  variable: '--font-space-mono',
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: META_TITLE,
  description: META_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  icons: { icon: '/kendrix-k.png' },
  openGraph: {
    title: META_TITLE,
    description: META_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    type: 'website',
    locale: 'en_US',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: META_TITLE }],
  },
  twitter: {
    card: 'summary_large_image',
    title: META_TITLE,
    description: META_DESCRIPTION,
    images: ['/og.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${nunito.variable} ${mulish.variable} ${spaceMono.variable}`}>
      <head>
        <StructuredData />
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-9QZT2HK4LC" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-9QZT2HK4LC');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
