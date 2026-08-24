import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commonsTitleMatchScore, resolveSubjectIdentity, sourceEntityImage, wikidataDeathYear, wikidataPersonFacts } from './source.js'

// Invariant 4's provider half: for a HUMAN, article resolution is the ONLY identity path. The free-text
// Commons fallback matches a name STRING with no identity anchor, so it could return a photograph of the
// wrong real person — and on the archival path that photograph is PRESENTED as authentic. These tests assert
// that path is unreachable, not merely unused.

const jsonRes = (body: unknown) => ({ ok: true, json: async () => body }) as unknown as Response
const bytesRes = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response

// A licence-clean Commons file, so the article path gets all the way to the identity check instead of
// bailing earlier for an unrelated reason.
const LEAD_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/1/19/X.jpg'
const COMMONS_FILE_OK = {
  query: {
    pages: [{
      imageinfo: [{
        url: LEAD_IMAGE_URL, thumburl: LEAD_IMAGE_URL, mime: 'image/jpeg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:X.jpg',
        extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Unknown' } },
      }],
    }],
  },
}

interface Routes {
  search?: unknown
  summary?: unknown
  pageprops?: unknown
  commonsFile?: unknown
  commonsSearch?: unknown
  wikidata?: unknown
}

let calls: string[] = []

function mockFetch(routes: Routes) {
  calls = []
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://upload.wikimedia.org')) return bytesRes()
    if (url.includes('wikidata.org')) return jsonRes(routes.wikidata ?? {})
    if (url.includes('commons.wikimedia.org') && url.includes('generator=search')) return jsonRes(routes.commonsSearch ?? {})
    if (url.includes('commons.wikimedia.org')) return jsonRes(routes.commonsFile ?? {})
    if (url.includes('rest_v1/page/summary')) return jsonRes(routes.summary ?? {})
    if (url.includes('en.wikipedia.org') && url.includes('prop=pageprops')) return jsonRes(routes.pageprops ?? {})
    if (url.includes('en.wikipedia.org') && url.includes('list=search')) return jsonRes(routes.search ?? {})
    return jsonRes({})
  })
}

const calledCommonsSearch = () => calls.some((u) => u.includes('commons.wikimedia.org') && u.includes('generator=search'))
const calledWikipediaSearch = () => calls.some((u) => u.includes('en.wikipedia.org') && u.includes('list=search'))

const SEARCH_HIT = { query: { search: [{ title: 'Some Subject' }] } }
const SEARCH_MISS = { query: { search: [] } }

beforeEach(() => { calls = [] })
afterEach(() => { vi.unstubAllGlobals() })

describe('requireArticleIdentity closes the free-text path', () => {
  it('returns null and never free-text searches when no article resolves', async () => {
    mockFetch({ search: SEARCH_MISS })
    expect(await sourceEntityImage('Some Living Official', { requireArticleIdentity: true })).toBeNull()
    expect(calledCommonsSearch()).toBe(false)
  })

  it('returns null on a disambiguation page', async () => {
    mockFetch({ search: SEARCH_HIT, summary: { type: 'disambiguation' } })
    expect(await sourceEntityImage('Ambiguous Name', { requireArticleIdentity: true })).toBeNull()
    expect(calledCommonsSearch()).toBe(false)
  })

  it('returns null when the article carries no Wikidata item — an article is not an identity', async () => {
    // Everything else succeeds: the article resolves, the lead image is licence-clean and downloads. The
    // ONLY thing missing is the identity anchor, and that alone must stop the sourcing.
    const routes = {
      search: SEARCH_HIT,
      summary: { type: 'standard', originalimage: { source: LEAD_IMAGE_URL } },
      commonsFile: COMMONS_FILE_OK,
      pageprops: { query: { pages: [{}] } }, // no pageprops.wikibase_item
    }
    mockFetch(routes)
    expect(await sourceEntityImage('Someone', { requireArticleIdentity: true })).toBeNull()
    expect(calledCommonsSearch()).toBe(false)

    // Control: the SAME responses, for a non-human subject, do produce an image — proving the null above is
    // the identity guard firing and not an artefact of the fixture.
    mockFetch(routes)
    expect(await sourceEntityImage('Someone')).not.toBeNull()
  })

  it('DOES still free-text search for a non-human subject, where a wrong hit is a subject mismatch', async () => {
    mockFetch({ search: SEARCH_MISS, commonsSearch: { query: { pages: [] } } })
    expect(await sourceEntityImage('Some Obscure Chapel')).toBeNull()
    expect(calledCommonsSearch()).toBe(true)
  })
})

describe('exact non-human retry search', () => {
  const COMMONS_SEARCH_OK = {
    query: {
      pages: [{
        index: 1,
        title: 'File:The exact issue.jpg',
        imageinfo: [{
          url: LEAD_IMAGE_URL, thumburl: LEAD_IMAGE_URL, mime: 'image/jpeg',
          descriptionurl: 'https://commons.wikimedia.org/wiki/File:The_exact_issue.jpg',
          extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Unknown' } },
        }],
      }],
    },
  }

  it('can bypass a wrong article lead and search Commons for the exact edition', async () => {
    mockFetch({ commonsSearch: COMMONS_SEARCH_OK })
    expect(await sourceEntityImage('The Blind Man issue 2 May 1917', { preferCommonsSearch: true })).not.toBeNull()
    expect(calledCommonsSearch()).toBe(true)
    expect(calledWikipediaSearch()).toBe(false)
  })

  it('never allows a human onto the unanchored retry path', async () => {
    mockFetch({ commonsSearch: COMMONS_SEARCH_OK })
    expect(await sourceEntityImage('Some Person', { requireArticleIdentity: true, preferCommonsSearch: true })).toBeNull()
    expect(calledCommonsSearch()).toBe(false)
  })

  it('ranks an exact dated issue title above a famous but loosely related first result', async () => {
    const famousUrl = 'https://upload.wikimedia.org/wikipedia/commons/1/11/Famous.jpg'
    const exactUrl = 'https://upload.wikimedia.org/wikipedia/commons/2/22/Exact.jpg'
    mockFetch({
      commonsSearch: {
        query: {
          pages: [
            {
              index: 1,
              title: 'File:Duchamp Fountain.jpg',
              imageinfo: [{
                url: famousUrl, thumburl: famousUrl, mime: 'image/jpeg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Duchamp_Fountain.jpg',
                extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Unknown' } },
              }],
            },
            {
              index: 15,
              title: 'File:The Richard Mutt Case, The Blind Man, No. 2, New York, 1917.jpg',
              imageinfo: [{
                url: exactUrl, thumburl: exactUrl, mime: 'image/jpeg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:The_Richard_Mutt_Case.jpg',
                extmetadata: { LicenseShortName: { value: 'Public domain' }, Artist: { value: 'Unknown' } },
              }],
            },
          ],
        },
      },
    })
    const result = await sourceEntityImage('The Blind Man No 2 1917', { preferCommonsSearch: true })
    expect(result?.sourceUrl).toContain('The_Richard_Mutt_Case')
  })

  it('weights dates and issue numbers as identity-bearing title tokens', () => {
    expect(commonsTitleMatchScore('The Blind Man No 2 1917', 'The Blind Man No 2 New York 1917'))
      .toBeGreaterThan(commonsTitleMatchScore('The Blind Man No 2 1917', 'The Blind Man issue 1 April'))
  })
})

describe('non-free local uploads are rejected as a LICENCE rule, not by accident', () => {
  // Live case, 2026-08-12: Marcel Duchamp's lead image is Man Ray's 1920-21 portrait served from
  // /wikipedia/en/ — a LOCAL en-wiki upload, which on English Wikipedia means non-free/fair-use. Commons
  // hosts only freely-licensed media; anything under /wikipedia/<projectcode>/ does not qualify.
  const localUpload = 'https://upload.wikimedia.org/wikipedia/en/3/34/Man_Ray%2C_1920-21%2C_Portrait_of_Marcel_Duchamp.jpg'

  it('refuses a fair-use local upload even when the article and identity resolve perfectly', async () => {
    mockFetch({
      search: SEARCH_HIT,
      summary: { type: 'standard', originalimage: { source: localUpload } },
      commonsFile: COMMONS_FILE_OK, // would succeed IF we ever asked for it
      pageprops: { query: { pages: [{ pageprops: { wikibase_item: 'Q5912' } }] } },
    })
    expect(await sourceEntityImage('Marcel Duchamp', { requireArticleIdentity: true })).toBeNull()
    // The decisive assertion: we must not even look the file up on Commons — a local upload is not a
    // Commons file, and resolving it by name could match an unrelated free file with the same title.
    expect(calls.some((u) => u.includes('commons.wikimedia.org'))).toBe(false)
  })

  it('refuses it for non-human subjects too, and does not fall back to free-text search', async () => {
    mockFetch({ search: SEARCH_HIT, summary: { type: 'standard', originalimage: { source: localUpload } }, commonsSearch: { query: { pages: [] } } })
    expect(await sourceEntityImage('Some Artwork')).toBeNull()
    // Free-text IS allowed for non-humans, so it may run — but it must not have used the non-free file.
    expect(calls.some((u) => u.startsWith('https://upload.wikimedia.org'))).toBe(false)
  })

  it('still accepts a genuine Commons-hosted lead image', async () => {
    mockFetch({
      search: SEARCH_HIT,
      summary: { type: 'standard', originalimage: { source: LEAD_IMAGE_URL } },
      commonsFile: COMMONS_FILE_OK,
      pageprops: { query: { pages: [{ pageprops: { wikibase_item: 'Q1' } }] } },
    })
    expect(await sourceEntityImage('Free Subject', { requireArticleIdentity: true })).not.toBeNull()
  })
})

describe('resolveSubjectIdentity', () => {
  it('requires a single non-disambiguation article WITH a Wikidata item', async () => {
    mockFetch({
      search: SEARCH_HIT,
      summary: { type: 'standard', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Some_Subject' } } },
      pageprops: { query: { pages: [{ pageprops: { wikibase_item: 'Q42' } }] } },
    })
    expect(await resolveSubjectIdentity('Some Subject')).toEqual({
      title: 'Some Subject',
      articleUrl: 'https://en.wikipedia.org/wiki/Some_Subject',
      wikibaseItem: 'Q42',
    })
  })

  it('resolves the article URL as a string (it is not a nested object)', async () => {
    mockFetch({
      search: SEARCH_HIT,
      summary: { type: 'standard', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/X' } } },
      pageprops: { query: { pages: [{ pageprops: { wikibase_item: 'Q1' } }] } },
    })
    expect((await resolveSubjectIdentity('X'))?.articleUrl).toBe('https://en.wikipedia.org/wiki/X')
  })

  it('is null for a disambiguation page or an empty query', async () => {
    mockFetch({ search: SEARCH_HIT, summary: { type: 'disambiguation' } })
    expect(await resolveSubjectIdentity('Ambiguous')).toBeNull()
    expect(await resolveSubjectIdentity('   ')).toBeNull()
  })
})

describe('wikidataPersonFacts — the anchor must be a PERSON, not merely an article', () => {
  const facts = (p31: string[], time?: string) => ({
    entities: {
      Q1: {
        claims: {
          P31: p31.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
          ...(time ? { P570: [{ mainsnak: { datavalue: { value: { time } } } }] } : {}),
        },
      },
    },
  })

  it('accepts an item that is instance-of human', async () => {
    mockFetch({ wikidata: facts(['Q5'], '+1896-12-30T00:00:00Z') })
    expect(await wikidataPersonFacts('Q1')).toEqual({ isHuman: true, deathYear: 1896 })
  })

  it('rejects an ARTWORK even though it resolved to a real article — the live Duchamp/Fountain case', async () => {
    // "Marcel Duchamp French artist" resolved to the article for *Fountain* (Q680864, instance-of artwork).
    // Reading a death date off that is meaningless; treating it as the person's anchor is the bug.
    mockFetch({ wikidata: facts(['Q838948']) }) // Q838948 = work of art
    expect(await wikidataPersonFacts('Q1')).toEqual({ isHuman: false, deathYear: null })
  })

  it('rejects an item with no P31 at all', async () => {
    mockFetch({ wikidata: { entities: { Q1: { claims: {} } } } })
    expect((await wikidataPersonFacts('Q1')).isHuman).toBe(false)
  })

  it('accepts a human whose P31 lists several classes', async () => {
    mockFetch({ wikidata: facts(['Q3658341', 'Q5']) })
    expect((await wikidataPersonFacts('Q1')).isHuman).toBe(true)
  })
})

describe('wikidataDeathYear — structured eligibility, never model belief', () => {
  const claim = (time: string) => ({ entities: { Q1: { claims: { P570: [{ mainsnak: { datavalue: { value: { time } } } }] } } } })

  it('parses a normal CE death date to its calendar year', async () => {
    mockFetch({ wikidata: claim('+1896-12-30T00:00:00Z') })
    expect(await wikidataDeathYear('Q1')).toBe(1896)
  })

  it('parses a year-precision date (the common Wikidata shape)', async () => {
    mockFetch({ wikidata: claim('+1543-00-00T00:00:00Z') })
    expect(await wikidataDeathYear('Q1')).toBe(1543)
  })

  it('parses a BCE date as negative — unambiguously historical', async () => {
    mockFetch({ wikidata: claim('-0044-03-15T00:00:00Z') })
    expect(await wikidataDeathYear('Q1')).toBe(-44)
  })

  it('is null when the item has no P570 at all', async () => {
    mockFetch({ wikidata: { entities: { Q1: { claims: {} } } } })
    expect(await wikidataDeathYear('Q1')).toBeNull()
  })

  it('is null for a malformed time value', async () => {
    mockFetch({ wikidata: claim('sometime in the past') })
    expect(await wikidataDeathYear('Q1')).toBeNull()
  })

  it('rejects a non-Wikidata id without calling out', async () => {
    mockFetch({})
    expect(await wikidataDeathYear('not-an-id')).toBeNull()
    expect(calls).toHaveLength(0)
  })
})
