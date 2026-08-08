import type { Metadata } from 'next'
import { Mulish, Nunito, Space_Mono } from 'next/font/google'
import Script from 'next/script'
import { StructuredData } from '@/components/structured-data'
import { META_DESCRIPTION, META_TITLE, SITE_NAME, SITE_URL } from '@/lib/site'
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
