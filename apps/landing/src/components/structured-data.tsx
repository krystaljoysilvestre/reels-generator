import { CONTACT_EMAIL, ENTITY_SENTENCE, META_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

/**
 * Site-wide JSON-LD, rendered once in the root layout so it's present on every page.
 *
 * Deliberately excludes anything Kendrix can't yet back up: no `aggregateRating` (no reviews
 * exist), no `offers`/price (pricing isn't set), no `sameAs` social links (none are published),
 * no employee or funding claims. Fabricated structured data is worse than none — it's both a
 * schema.org guideline violation and the exact kind of unverifiable claim the product's own
 * pre-launch honesty rule forbids elsewhere. Add these fields only when they become true.
 */
export function StructuredData() {
  const graph = [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/kendrix-k.png`,
      description: ENTITY_SENTENCE,
      email: CONTACT_EMAIL,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: META_DESCRIPTION,
      publisher: { '@id': `${SITE_URL}/#organization` },
      inLanguage: 'en',
    },
    {
      '@type': 'SoftwareApplication',
      '@id': `${SITE_URL}/#software`,
      name: SITE_NAME,
      url: SITE_URL,
      description: ENTITY_SENTENCE,
      applicationCategory: 'MultimediaApplication',
      operatingSystem: 'Web',
      image: `${SITE_URL}/og.png`,
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ]

  return (
    <script
      type="application/ld+json"
      // Values are all authored constants (SITE_URL, ENTITY_SENTENCE, …), never request input —
      // there is no user-supplied string reaching this HTML.
      dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }) }}
    />
  )
}

/**
 * FAQPage structured data. Takes the same Q/A array the visible FAQ renders, so the markup and the
 * schema can never drift apart — the standing risk with hand-duplicated JSON-LD.
 */
export function FaqStructuredData({ items }: { items: Array<{ q: string; a: string }> }) {
  const json = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }}
    />
  )
}
