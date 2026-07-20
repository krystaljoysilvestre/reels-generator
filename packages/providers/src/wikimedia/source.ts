// Wikimedia image sourcing for the FACTUAL genre — fetch a real, licence-clean photograph of a named real
// place, with provenance so the reel can attribute it. Free API (no per-call cost to account). Fails soft:
// returns null on any problem so the caller falls back to a generated plate.
//
// COLLISION HANDLING (same-name places): resolution goes through the DISAMBIGUATED Wikipedia article, not a
// raw image search — "San Agustín Church (Manila)" and "(Cebu)" are distinct articles, so the article's
// canonical lead image is the right instance by construction. If a query lands on a DISAMBIGUATION page
// (a genuine same-name collision), we FAIL SOFT (return null) rather than guess a wrong instance — for
// factual content, "no photo" beats "a confidently wrong one". A raw Commons free-text search is kept only
// as a fallback for real places that have a photo but no English Wikipedia article (weaker on collisions,
// so it runs last and still passes through the caller's confidence-verify).
//
// NOTE: none of this resolves freedom-of-panorama. Some countries (the Philippines among them) have no FoP
// exception, so a photo of a modern building/monument can be copyright-encumbered even under a free FILE
// licence. That remains a human/legal review before PUBLIC publishing — this only guarantees the file licence.

export interface SourcedImage {
  buffer: Buffer
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  license: string // human-readable, e.g. 'CC BY-SA 4.0', 'Public domain'
  author: string // plain text (HTML stripped); '' if unknown
  sourceUrl: string // the file/article page (for attribution)
  title: string // the resolved place title
}

const UA = 'reels-generator/1.0 (documentary place-image sourcing; contact via app operator)'

// Licences we accept: public domain / CC0 / CC BY / CC BY-SA. Everything else (non-free, fair-use, NC/ND) is
// rejected, so capture is licence-clean by construction.
const OK_LICENSE = /public domain|^pd\b|cc0|cc[ -]?by(?:[ -]sa)?[ -]?\d|creative commons attribution/i
const BAD_LICENSE = /fair.?use|non.?free|no[nc].?commercial|no.?deriv|-nd\b|-nc\b/i

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const stripHtml = (s: string): string => s.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
const licenceClean = (l: string): boolean => Boolean(l) && !BAD_LICENSE.test(l) && OK_LICENSE.test(l)
const mimeOk = (m: string): m is SourcedImage['mime'] => m === 'image/jpeg' || m === 'image/png' || m === 'image/webp'

function extMeta(imageinfo: Record<string, unknown>, key: string): string {
  return str(asObj(asObj(imageinfo['extmetadata'])[key])['value'])
}

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA }, signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function download(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

// A Commons upload URL → the "File:Name.ext" title. Handles both the original and /thumb/ forms:
//   .../commons/1/19/Foo.jpg  and  .../commons/thumb/1/19/Foo.jpg/800px-Foo.jpg
function fileTitleFromUploadUrl(url: string): string | null {
  const m = url.match(/\/(?:commons|[a-z-]+\.wikipedia)\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/)
  return m && m[1] ? `File:${decodeURIComponent(m[1])}` : null
}

// Fetch a Commons file's licence + a clean 1600px URL by its "File:…" title. null if not licence-clean.
async function commonsFileByTitle(fileTitle: string): Promise<{ imgUrl: string; mime: SourcedImage['mime']; license: string; author: string; sourceUrl: string } | null> {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    titles: fileTitle, prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '1600',
  }).toString()
  const data = await getJson(api.toString())
  const page = asObj(asArr(asObj(asObj(data)['query'])['pages'])[0])
  const ii = asObj(asArr(page['imageinfo'])[0])
  if (Object.keys(ii).length === 0) return null
  const license = stripHtml(extMeta(ii, 'LicenseShortName') || extMeta(ii, 'License'))
  if (!licenceClean(license)) return null
  const mime = str(ii['mime'])
  if (!mimeOk(mime)) return null
  const imgUrl = str(ii['thumburl']) || str(ii['url'])
  if (!imgUrl) return null
  const sourceUrl = str(ii['descriptionurl']) || `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle)}`
  return { imgUrl, mime, license, author: stripHtml(extMeta(ii, 'Artist')), sourceUrl }
}

// PRIMARY: resolve the query to a specific, disambiguated Wikipedia article and use its lead image.
// Returns 'ambiguous' when the query resolves to a disambiguation page (same-name collision → do NOT guess).
async function resolveViaWikipediaArticle(query: string): Promise<SourcedImage | 'ambiguous' | null> {
  // 1) Best-matching article title for the query.
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php')
  searchUrl.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    list: 'search', srsearch: query, srnamespace: '0', srlimit: '3',
  }).toString()
  const search = await getJson(searchUrl.toString())
  const top = asObj(asArr(asObj(asObj(search)['query'])['search'])[0])
  const title = str(top['title'])
  if (!title) return null

  // 2) Article summary — flags disambiguation + carries the lead image.
  const summary = asObj(await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`))
  if (str(summary['type']) === 'disambiguation') return 'ambiguous' // same-name collision → fail soft

  const leadUrl = str(asObj(summary['originalimage'])['source']) || str(asObj(summary['thumbnail'])['source'])
  if (!leadUrl) return null
  const fileTitle = fileTitleFromUploadUrl(leadUrl)
  if (!fileTitle) return null

  // 3) The lead image's licence + a clean 1600px copy from Commons.
  const file = await commonsFileByTitle(fileTitle)
  if (!file) return null
  const buffer = await download(file.imgUrl)
  if (!buffer) return null
  const pageUrl = str(asObj(asObj(asObj(summary['content_urls'])['desktop'])['page'])) || file.sourceUrl
  return { buffer, mime: file.mime, license: file.license, author: file.author, sourceUrl: file.sourceUrl || pageUrl, title }
}

// FALLBACK: raw Commons free-text search (File namespace). For real places with a photo but no English
// Wikipedia article. Weaker on same-name collisions, so it runs only after article resolution finds nothing;
// the caller's confidence-verify is the remaining guard.
async function resolveViaCommonsSearch(query: string): Promise<SourcedImage | null> {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '10',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: '1600',
  }).toString()
  const data = await getJson(api.toString())
  const pages = asArr(asObj(asObj(data)['query'])['pages']).map(asObj)
  pages.sort((a, b) => Number(a['index'] ?? 999) - Number(b['index'] ?? 999))

  for (const p of pages) {
    const ii = asObj(asArr(p['imageinfo'])[0])
    if (Object.keys(ii).length === 0) continue
    const license = stripHtml(extMeta(ii, 'LicenseShortName') || extMeta(ii, 'License'))
    if (!licenceClean(license)) continue
    const mime = str(ii['mime'])
    if (!mimeOk(mime)) continue
    const url = str(ii['thumburl']) || str(ii['url'])
    if (!url) continue
    const buffer = await download(url)
    if (!buffer) continue
    const title = str(p['title'])
    const sourceUrl = str(ii['descriptionurl']) || (title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}` : '')
    return { buffer, mime, license, author: stripHtml(extMeta(ii, 'Artist')), sourceUrl, title }
  }
  return null
}

// Resolve a place name to a real licensed photo. Article-first (disambiguated) → fail soft on ambiguity →
// Commons search fallback. Returns null when nothing safe is found (caller uses a generated plate).
export async function sourcePlaceImage(query: string): Promise<SourcedImage | null> {
  const q = query.trim()
  if (!q) return null
  const viaArticle = await resolveViaWikipediaArticle(q)
  if (viaArticle === 'ambiguous') {
    console.warn(`[wikimedia] "${q}" is an ambiguous (same-name) place — not sourcing, using a generated plate instead`)
    return null
  }
  if (viaArticle) return viaArticle
  return resolveViaCommonsSearch(q)
}
