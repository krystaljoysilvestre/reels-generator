// Wikimedia image sourcing for real-world SUBJECTS — fetch a real, licence-clean photograph of a named real
// place, object, animal or person, with provenance so the reel can attribute it. Free API (no per-call cost
// to account). Fails soft: returns null on any problem so the caller falls back to a generated plate.
//
// COLLISION HANDLING (same-name subjects): resolution goes through the DISAMBIGUATED Wikipedia article, not a
// raw image search — "San Agustín Church (Manila)" and "(Cebu)" are distinct articles, so the article's
// canonical lead image is the right instance by construction. If a query lands on a DISAMBIGUATION page
// (a genuine same-name collision), we FAIL SOFT (return null) rather than guess a wrong instance — for
// factual content, "no photo" beats "a confidently wrong one". A raw Commons free-text search is kept only
// as a fallback for real subjects that have a photo but no English Wikipedia article (weaker on collisions,
// so it runs last and still passes through the caller's confidence-verify).
//
// ── IDENTITY IS NOT THE SAME GUARANTEE FOR EVERY SUBJECT ────────────────────────────────────────────────
// The free-text fallback matches a NAME STRING and has no identity anchor. For a place/object/animal that is
// acceptable: a wrong hit is a SUBJECT mismatch, and the caller's vision verify genuinely catches "a beach
// for a cathedral". For a HUMAN it is not acceptable — the verify step is documented as weak at
// wrong-but-similar, and for a face that is precisely the failure mode, so a name-string match can return a
// photograph of the WRONG REAL PERSON. Callers depicting a person pass `requireArticleIdentity: true`, which
// makes article resolution the ONLY identity path: no article (or a disambiguation page) → null, never a
// free-text guess. See specs/depictive-fidelity.md.
//
// NOTE: none of this resolves freedom-of-panorama. Some countries (the Philippines among them) have no FoP
// exception, so a photo of a modern building/monument can be copyright-encumbered even under a free FILE
// licence. That remains a human/legal review before PUBLIC publishing — this only guarantees the file licence.

export interface SourcedImage {
  buffer: Buffer
  mime: 'image/jpeg' | 'image/png' | 'image/webp'
  license: string // human-readable, e.g. 'CC BY-SA 4.0', 'Public domain'
  licenseUrl: string // machine-readable licence deed (CC-BY compliance); '' if the file doesn't declare one
  author: string // plain text (HTML stripped); '' if unknown
  sourceUrl: string // the FILE page (for attribution)
  articleUrl: string // the Wikipedia article page; '' when resolved via free-text Commons search
  title: string // the resolved subject title
  wikibaseItem: string // Wikidata id (e.g. 'Q34597') — the identity anchor; '' when not article-resolved
}

export interface SourceOptions {
  /**
   * Require the subject to resolve to a single non-disambiguation Wikipedia article carrying a Wikidata id,
   * and DISABLE the free-text Commons fallback. Mandatory for humans — see the identity note above.
   */
  requireArticleIdentity?: boolean
  /**
   * Search Commons directly instead of accepting a Wikipedia article's lead image. Used only for non-human
   * retry candidates after the lead image failed the caller's exact identity/state verifier — for example,
   * an article lead showing issue 1 when the story requires a page from issue 2.
   */
  preferCommonsSearch?: boolean
}

const UA = 'reels-generator/1.0 (documentary subject-image sourcing; contact via app operator)'

/**
 * Width we ask Commons for. Deliberately MODEST, and the reason is not aesthetic.
 *
 * MediaWiki never upscales: if `iiurlwidth` is ≥ the file's own width it serves the ORIGINAL rather than a
 * thumbnail. Archival originals are large, high-quality scans, and the vision verifier rejects them —
 * reproduced 2026-08-12 on Stieglitz's photograph of Duchamp's *Fountain* (1416px wide): asking for 1600
 * returned the 2.19MB original and Anthropic answered `400 Could not process image`, while asking for 1024
 * returned a 0.33MB thumbnail that verified fine.
 *
 * 1024 is ample for both jobs it has to do — a coarse "is this the right subject?" check, and conditioning a
 * generated frame (reference images are downscaled by the image models anyway) — and it keeps us on the
 * thumbnail path for essentially every real archival file.
 */
const SOURCE_IMAGE_WIDTH = 1024

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

// A COMMONS upload URL → the "File:Name.ext" title. Handles both the original and /thumb/ forms:
//   .../commons/1/19/Foo.jpg  and  .../commons/thumb/1/19/Foo.jpg/800px-Foo.jpg
//
// ⚠️ COMMONS ONLY, AND THAT IS THE LICENCE GUARANTEE — not a parsing detail.
// upload.wikimedia.org serves two kinds of file. `/wikipedia/commons/…` is Wikimedia Commons, which accepts
// only freely-licensed media. `/wikipedia/<projectcode>/…` (e.g. `/wikipedia/en/…`) is a file uploaded
// LOCALLY to that project — and on English Wikipedia local upload exists almost exclusively for NON-FREE
// fair-use media, which we may never redistribute in a rendered reel.
//
// Found live on 2026-08-12: Marcel Duchamp's lead image is Man Ray's 1920-21 portrait at
// `/wikipedia/en/3/34/…` — still in copyright, fair-use on en-wiki. The old pattern also listed
// `[a-z-]+\.wikipedia`, which happened not to match the bare `en` segment, so the non-free file was rejected
// by ACCIDENT and reported as "no Wikipedia article". Anyone later "fixing" that pattern to accept local
// uploads would have silently started pulling fair-use images into published video.
function fileTitleFromUploadUrl(url: string): string | null {
  const m = url.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/?]+)/)
  return m && m[1] ? `File:${decodeURIComponent(m[1])}` : null
}

/** True for an upload.wikimedia.org file hosted locally by a project rather than on Commons (⇒ non-free). */
function isLocalNonFreeUpload(url: string): boolean {
  return /\/wikipedia\/(?!commons\/)[a-z-]{2,}\//.test(url)
}

// Fetch a Commons file's licence + a clean 1600px URL by its "File:…" title. null if not licence-clean.
async function commonsFileByTitle(fileTitle: string): Promise<{ imgUrl: string; mime: SourcedImage['mime']; license: string; licenseUrl: string; author: string; sourceUrl: string } | null> {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    titles: fileTitle, prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(SOURCE_IMAGE_WIDTH),
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
  return { imgUrl, mime, license, licenseUrl: extMeta(ii, 'LicenseUrl'), author: stripHtml(extMeta(ii, 'Artist')), sourceUrl }
}

// ── Wikidata death date (P570) ───────────────────────────────────────────────────────────────────────────
// The ELIGIBILITY half of human depiction. Read from structured data, never from a model's belief about who
// is alive: a language model asked "is this person long dead?" will answer confidently and sometimes wrongly,
// and the cost of wrong is a fabricated likeness of a living person.
//
// P570 is frequently YEAR-precision only in Wikidata, so we deliberately extract a calendar YEAR and let the
// caller compare years. Pretending to day accuracy we don't have would be false precision on a safety gate.
// Returns null when the item has no usable death year — which callers MUST treat as ineligible, not unknown.
export interface PersonFacts {
  /** P31 (instance of) includes Q5 (human). FALSE means the article is not about a person at all. */
  isHuman: boolean
  /** P570 death year; null when absent or unparseable. Callers MUST treat null as ineligible. */
  deathYear: number | null
}

/**
 * The two structured facts human depiction turns on, from ONE Wikidata call.
 *
 * `isHuman` is not a formality — it closes a real hole found live on 2026-08-12. The decider's query is
 * LLM-written and free-text search resolves it to whatever article ranks first: "Marcel Duchamp French
 * artist" resolved to the article for *Fountain*, his 1917 readymade. Without this check the pipeline would
 * happily treat an ARTWORK's Wikidata item as the person's identity anchor and read P570 off it. Here that
 * failed safe (an artwork has no death date → ineligible), but the mirror case does not: a query for a
 * LIVING person that lands on a long-dead namesake's article would return a death year, pass the historical
 * gate, and mint a conditioning plate of the wrong human. Anchoring to "an article" was never enough — it
 * has to be an article about a PERSON.
 */
export async function wikidataPersonFacts(wikibaseItem: string): Promise<PersonFacts> {
  const deathYear = await wikidataDeathYear(wikibaseItem)
  const id = wikibaseItem.trim()
  if (!/^Q\d+$/.test(id)) return { isHuman: false, deathYear }
  const claims = await wikidataClaims(id)
  const isHuman = asArr(claims['P31']).map(asObj).some(
    (c) => str(asObj(asObj(asObj(asObj(c['mainsnak'])['datavalue'])['value']))['id']) === 'Q5',
  )
  return { isHuman, deathYear }
}

async function wikidataClaims(id: string): Promise<Record<string, unknown>> {
  const api = new URL('https://www.wikidata.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'wbgetentities', format: 'json', formatversion: '2',
    ids: id, props: 'claims', languages: 'en',
  }).toString()
  const data = await getJson(api.toString())
  return asObj(asObj(asObj(asObj(data)['entities'])[id])['claims'])
}

export async function wikidataDeathYear(wikibaseItem: string): Promise<number | null> {
  const id = wikibaseItem.trim()
  if (!/^Q\d+$/.test(id)) return null
  const claims = await wikidataClaims(id)
  for (const claim of asArr(claims['P570']).map(asObj)) {
    const value = asObj(asObj(asObj(claim['mainsnak'])['datavalue'])['value'])
    // Wikidata times look like '+1896-12-30T00:00:00Z'; a BCE date carries a leading '-'. Anyone with a BCE
    // death date is unambiguously historical, so map it to a very old year rather than failing to parse.
    const time = str(value['time'])
    const m = time.match(/^([+-])(\d{1,16})-/)
    if (!m) continue
    const year = Number(m[2])
    if (!Number.isFinite(year) || year === 0) continue
    return m[1] === '-' ? -year : year
  }
  return null
}

// The article's Wikidata id — the IDENTITY ANCHOR. A subject that resolves to a single non-disambiguation
// article with a Wikidata item is one we can name; one that doesn't, isn't. Free call.
async function wikibaseItemForTitle(title: string): Promise<string> {
  const api = new URL('https://en.wikipedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    titles: title, prop: 'pageprops', ppprop: 'wikibase_item',
  }).toString()
  const data = await getJson(api.toString())
  const page = asObj(asArr(asObj(asObj(data)['query'])['pages'])[0])
  return str(asObj(page['pageprops'])['wikibase_item'])
}

// Search → summary, with the disambiguation guard. Shared by the image path and the identity-only path so
// both agree on what "resolves to one article" means.
async function resolveArticle(query: string): Promise<{ title: string; summary: Record<string, unknown> } | 'ambiguous' | null> {
  const searchUrl = new URL('https://en.wikipedia.org/w/api.php')
  searchUrl.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    list: 'search', srsearch: query, srnamespace: '0', srlimit: '3',
  }).toString()
  const search = await getJson(searchUrl.toString())
  const top = asObj(asArr(asObj(asObj(search)['query'])['search'])[0])
  const title = str(top['title'])
  if (!title) return null

  const summary = asObj(await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`))
  if (str(summary['type']) === 'disambiguation') return 'ambiguous' // same-name collision → fail soft
  return { title, summary }
}

export interface SubjectIdentity {
  title: string
  articleUrl: string
  wikibaseItem: string
}

/**
 * IDENTITY ONLY — resolve who/what a name refers to, without downloading any image.
 *
 * Separate from `sourceEntityImage` on purpose: a person's depiction eligibility has to be settled BEFORE we
 * fetch their photograph, so bytes of a living person's portrait never land in storage on a path that was
 * never allowed to present them. Returns null when the name is ambiguous, has no article, or the article
 * carries no Wikidata item — all of which mean "we cannot say who this is".
 */
export async function resolveSubjectIdentity(query: string): Promise<SubjectIdentity | null> {
  const q = query.trim()
  if (!q) return null
  const resolved = await resolveArticle(q)
  if (!resolved || resolved === 'ambiguous') return null
  const wikibaseItem = await wikibaseItemForTitle(resolved.title)
  if (!wikibaseItem) return null
  return {
    title: resolved.title,
    articleUrl: str(asObj(asObj(resolved.summary['content_urls'])['desktop'])['page']),
    wikibaseItem,
  }
}

// Why article resolution produced no image. Distinguishing these matters for diagnosis: "we don't know who
// this is" and "we know exactly who this is but their only picture is non-free" are opposite situations, and
// conflating them sent us hunting for a missing article that was there all along.
type ArticleMiss = 'ambiguous' | 'no-article' | 'no-free-image'

// PRIMARY: resolve the query to a specific, disambiguated Wikipedia article and use its lead image.
async function resolveViaWikipediaArticle(query: string): Promise<SourcedImage | ArticleMiss> {
  const resolved = await resolveArticle(query)
  if (resolved === 'ambiguous') return 'ambiguous'
  if (!resolved) return 'no-article'
  const { title, summary } = resolved

  const leadUrl = str(asObj(summary['originalimage'])['source']) || str(asObj(summary['thumbnail'])['source'])
  if (!leadUrl) return 'no-free-image'
  if (isLocalNonFreeUpload(leadUrl)) {
    console.warn(`[wikimedia] "${title}" lead image is a LOCAL (non-Commons) upload — non-free/fair-use, not usable: ${leadUrl}`)
    return 'no-free-image'
  }
  const fileTitle = fileTitleFromUploadUrl(leadUrl)
  if (!fileTitle) return 'no-free-image'

  // 3) The lead image's licence + a clean 1600px copy from Commons.
  const file = await commonsFileByTitle(fileTitle)
  if (!file) return 'no-free-image'
  const buffer = await download(file.imgUrl)
  if (!buffer) return 'no-free-image'
  // `content_urls.desktop.page` is a STRING, so it must be read with str() directly — the previous
  // asObj(...)['page'] wrapping always yielded '' and silently fell through to the file page. Harmless while
  // nothing consumed it; now that provenance distinguishes the article from the file, it has to be right.
  const articleUrl = str(asObj(asObj(summary['content_urls'])['desktop'])['page'])
  const wikibaseItem = await wikibaseItemForTitle(title)
  return {
    buffer, mime: file.mime, license: file.license, licenseUrl: file.licenseUrl, author: file.author,
    sourceUrl: file.sourceUrl || articleUrl, articleUrl, title, wikibaseItem,
  }
}

// FALLBACK: raw Commons free-text search (File namespace). For real subjects with a photo but no English
// Wikipedia article. Weaker on same-name collisions, so it runs only after article resolution finds nothing;
// the caller's confidence-verify is the remaining guard. Carries NO identity anchor (no wikibaseItem, no
// articleUrl) — which is exactly why `requireArticleIdentity` skips it for humans.
async function resolveViaCommonsSearch(query: string): Promise<SourcedImage | null> {
  const api = new URL('https://commons.wikimedia.org/w/api.php')
  api.search = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2',
    // Ask for enough candidates that an exact issue/page can outrank a famous but merely related lead image.
    // The response is free metadata; paid vision still sees only the first licence-clean ranked candidate.
    generator: 'search', gsrsearch: query, gsrnamespace: '6', gsrlimit: '25',
    prop: 'imageinfo', iiprop: 'url|mime|extmetadata', iiurlwidth: String(SOURCE_IMAGE_WIDTH),
  }).toString()
  const data = await getJson(api.toString())
  const pages = asArr(asObj(asObj(data)['query'])['pages']).map(asObj)
  pages.sort((a, b) => {
    const byIdentity = commonsTitleMatchScore(query, str(b['title'])) - commonsTitleMatchScore(query, str(a['title']))
    return byIdentity || Number(a['index'] ?? 999) - Number(b['index'] ?? 999)
  })

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
    return {
      buffer, mime, license, licenseUrl: extMeta(ii, 'LicenseUrl'), author: stripHtml(extMeta(ii, 'Artist')),
      sourceUrl, articleUrl: '', title, wikibaseItem: '',
    }
  }
  return null
}

// Commons full-text rank is relevance-to-topic, not exact visual identity: a search for a dated magazine
// issue can put the famous artwork ahead of the issue page that actually contains it. Re-rank the returned
// FILE TITLES by deterministic query-token overlap before paying vision to judge pixels. Dates and issue
// numbers carry extra weight because they distinguish editions/states; generic connective words carry none.
const COMMONS_TITLE_STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'by', 'file', 'for', 'from', 'in', 'jpg', 'jpeg', 'of', 'on', 'png', 'the', 'to', 'webp', 'with'])

export function commonsTitleMatchScore(query: string, title: string): number {
  const tokens = (value: string) => value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((token) => token && !COMMONS_TITLE_STOP_WORDS.has(token))
  const wanted = new Set(tokens(query))
  return tokens(title).reduce((score, token) => {
    if (!wanted.has(token)) return score
    if (/^\d+$/.test(token)) return score + 3
    return score + (token.length >= 5 ? 2 : 1)
  }, 0)
}

/**
 * Resolve a real subject's name to a real licensed photo. Article-first (disambiguated) → fail soft on
 * ambiguity → Commons free-text search. Returns null when nothing safe is found (caller uses a generated
 * plate, or representative staging for a person).
 *
 * `requireArticleIdentity` drops the free-text fallback and demands a Wikidata id: mandatory for humans,
 * because a name-string match has no identity anchor and the caller's vision verify is weak at
 * wrong-but-similar faces.
 */
export async function sourceEntityImage(query: string, opts: SourceOptions = {}): Promise<SourcedImage | null> {
  const q = query.trim()
  if (!q) return null
  if (opts.preferCommonsSearch) {
    // A human may never enter the unanchored free-text path, regardless of option combinations.
    if (opts.requireArticleIdentity) return null
    return resolveViaCommonsSearch(q)
  }
  const viaArticle = await resolveViaWikipediaArticle(q)
  if (viaArticle === 'ambiguous') {
    console.warn(`[wikimedia] "${q}" is an ambiguous (same-name) subject — not sourcing, using a generated plate instead`)
    return null
  }
  if (typeof viaArticle !== 'string') {
    // Identity-required callers need the anchor itself, not merely an article that happened to resolve.
    if (opts.requireArticleIdentity && !viaArticle.wikibaseItem) {
      console.warn(`[wikimedia] "${q}" resolved to an article with no Wikidata item — identity unverified, not sourcing`)
      return null
    }
    return viaArticle
  }
  if (opts.requireArticleIdentity) {
    // Say which of the two happened. A person with a well-known article but only a fair-use portrait is a
    // LICENCE outcome, not an identity one, and reporting it as "no article" sends the next reader looking
    // for a page that exists.
    const why = viaArticle === 'no-article'
      ? 'no Wikipedia article — identity unverified'
      : 'no freely-licensed image on the article — nothing usable'
    console.warn(`[wikimedia] "${q}": ${why}; not sourcing (free-text search is disabled for this subject)`)
    return null
  }
  return resolveViaCommonsSearch(q)
}
