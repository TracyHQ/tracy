/**
 * THE PAGES OF A SITE, AS A CUSTOMER NAMES THEM: BY ADDRESS.
 *
 * A customer says "the About page" or pastes a link; the content map is organised by record type
 * (pages, articles, shared parts). Without a list of addresses the agent walked the listing type by
 * type to find which record a link shows — 12 `content.list` + 7 `content.read` calls for one
 * question in round 5b (26/09/2026). `view=pages` is that walk done once, here, for every
 * platform: the relay follows the Claude Cowork plugin's own listing cursor and keeps every row that has an
 * address. No Claude Cowork plugin learns a new query; an old one answers exactly as before.
 */
import { DEFAULT_MAX_BYTES } from '../lib/content-api.js'

/** Rows a listing call asks for: the schema's maximum. */
export const PAGES_LISTING_LIMIT = 100
/** Listing calls one `view=pages` may make before it answers `truncated`. */
export const PAGES_MAX_CALLS = 20
/**
 * The language twins one row (or one `content.locate` record level) lists, at most. A site in dozens
 * of languages would repeat its whole group on every row — 39 twins × 1,720 pages on the 40-language
 * EmDash dev site — so a larger group lists none, and the row keeps its `translationGroupId` for the
 * agent to group by.
 */
export const ALTERNATES_MAX = 8

/**
 * The path of `address` on the site at `siteUrl`, as a customer would paste it: no origin, no
 * trailing slash (the root stays `/`), percent-decoded, and the query kept only when the address
 * needs it to name a page (Joomla's `index.php?Itemid=5`).
 * @param {string} address
 * @param {string | null | undefined} siteUrl
 * @returns {string | null}
 */
export function pagePath(address, siteUrl) {
  let parsed
  try {
    parsed = new URL(address, siteUrl ?? undefined)
  } catch {
    return null
  }
  let base = ''
  try {
    if (siteUrl) base = new URL(siteUrl).pathname.replace(/\/+$/, '')
  } catch {
    base = ''
  }
  let path = parsed.pathname
  if (base && (path === base || path.startsWith(`${base}/`))) path = path.slice(base.length)
  path = path.replace(/\/+$/, '') || '/'
  try {
    path = decodeURI(path)
  } catch {
    // an address with a broken escape keeps its bytes
  }
  return parsed.search ? `${path}${parsed.search}` : path
}

/**
 * The twins of every row, by the CMS's own translation group (`translationGroupId`: Joomla
 * associations, Polylang's `post_translations`, an EmDash translation group): the other rows of the
 * group, each in its own language. Read from every row the walk listed — a twin needs no address to
 * be one. A row whose group lists no other language, or more than {@link ALTERNATES_MAX}, has none.
 * @param {any[]} rows
 * @returns {(row: any) => { locale: string, id: string }[] | null}
 */
function twinsOf(rows) {
  /** @type {Map<string, Map<string, string>>} group → id → locale */
  const groups = new Map()
  for (const row of rows) {
    const group = row?.translationGroupId
    if (typeof group !== 'string' || group === '' || typeof row.id !== 'string') continue
    if (typeof row.locale !== 'string' || row.locale === '') continue
    if (!groups.has(group)) groups.set(group, new Map())
    groups.get(group)?.set(row.id, row.locale)
  }
  return (row) => {
    const members = groups.get(row?.translationGroupId)
    if (!members) return null
    const others = [...members]
      .filter(([id, locale]) => id !== row.id && locale !== row.locale)
      .map(([id, locale]) => ({ locale, id }))
    return others.length > 0 && others.length <= ALTERNATES_MAX ? others : null
  }
}

/**
 * The `tracy-content-pages/v1` document from the listing envelopes one walk collected.
 * @param {any[]} listings - v1 envelopes, in cursor order.
 * @param {{ truncated: boolean, link?: string | null, alternates?: boolean }} walk - `link`: keep
 *   only the page it shows. `alternates`: the walk listed every language, so each row can name its
 *   twins (`twinsOf`); a walk of one language, or one cut short, cannot, and names none.
 */
export function pagesDocument(listings, { truncated, link = null, alternates = false, candidates = null }) {
  const site = listings[0]?.site ?? null
  const rows = listings.flatMap((listing) => (Array.isArray(listing?.contents) ? listing.contents : []))
  const twins = alternates && !truncated ? twinsOf(rows) : () => null
  const pages = []
  const seen = new Set()
  for (const row of candidates === null ? rows : candidates.map((i) => rows[i])) {
    if (typeof row?.url !== 'string' || row.url === '' || seen.has(row.id)) continue
    if (link !== null && !linkShowsPage(link, row.url, site?.url)) continue
    seen.add(row.id)
    const others = twins(row)
    pages.push({
      id: row.id,
      type: row.type,
      title: row.title ?? null,
      url: row.url,
      path: pagePath(row.url, site?.url),
      locale: row.locale ?? null,
      translationGroupId: row.translationGroupId ?? null,
      ...(others ? { alternates: others } : {}),
      status: row.publication?.status ?? null,
      // The CMS's own records, as content.get / content.update / content.delete take them. Only
      // when the Claude Cowork plugin named them: a guess would send a write to the wrong row.
      ...(Array.isArray(row.native) ? { native: row.native } : {})
    })
  }
  return {
    schemaVersion: 'tracy-content-pages/v1',
    site,
    ...(link !== null ? { link } : {}),
    pages,
    truncated
  }
}

/**
 * THE SIZE OF ONE PAGES ANSWER: the byte budget every Content API document is held to
 * (`@tracy/content-api` `DEFAULT_MAX_BYTES`, 256 KiB, which `validatePages` checks). A walk can hold
 * far more — a 40-language EmDash site answered 527–578 KB (1,568–1,720 rows) on the stand, 28/09/2026
 * — and an answer past the budget is one the model cannot take in whole anyway. There is no
 * `maxBytes` for this view: the budget is already the largest range any read accepts
 * (`MAX_BYTES_RANGE`), so a larger answer cannot be asked for, and a smaller one is what a narrower
 * read gives.
 */
export const PAGES_MAX_BYTES = DEFAULT_MAX_BYTES

/**
 * The read that fits when a pages answer had to be cut: one language when the walk read them all,
 * otherwise one content type at a time through the ordinary listing and its cursor.
 * @param {Record<string, unknown>} filter - the listing filter the walk used (`locale`).
 * @param {{ defaultLocale?: unknown, locales?: unknown } | null | undefined} site - the listing's `site`.
 */
export function narrowerPagesCall(filter, site) {
  const locales = Array.isArray(site?.locales) ? site.locales : []
  if (filter.locale === undefined && locales.length > 1) {
    const locale = typeof site?.defaultLocale === 'string' ? site.defaultLocale : locales[0]
    return {
      action: 'content.read',
      params: { view: 'pages', locale },
      why: 'Too many pages for one answer: read them one language at a time, with each locale of site.locales in turn.'
    }
  }
  return {
    action: 'content.read',
    params: { type: 'page', ...(filter.locale !== undefined ? { locale: filter.locale } : {}) },
    why: 'Too many pages for one answer even in one language: list one type at a time (page, article, service, project) and follow pagination.nextCursor.'
  }
}

/**
 * `answer` within `maxBytes`, cut at whole rows from the end of `pages`: the rows it keeps are
 * exactly the first rows of the walk, `truncated` is true and `next` names the narrower read.
 * An answer that fits is returned as it was.
 * @template {{ pages: any[], truncated: boolean }} T
 * @param {T} answer - the whole answer as it would be sent (version and hints included).
 * @param {{ maxBytes?: number, next: object }} options
 * @returns {T}
 */
export function fitPages(answer, { maxBytes = PAGES_MAX_BYTES, next }) {
  const bytes = (/** @type {unknown} */ value) => Buffer.byteLength(JSON.stringify(value), 'utf8')
  if (bytes(answer) <= maxBytes) return answer
  const pages = [...answer.pages]
  const cut = { ...answer, pages, truncated: true, next }
  let size = bytes(cut)
  // Dropping the last of n rows removes its bytes and, when n > 1, the comma before it.
  while (pages.length > 0 && size > maxBytes) size -= bytes(pages.pop()) + (pages.length > 0 ? 1 : 0)
  return cut
}

/**
 * Walk the Claude Cowork plugin's listing from the first call to its last cursor (or `PAGES_MAX_CALLS`).
 * @param {(params: Record<string, unknown>) => Promise<any>} ask - one listing call; resolves to a
 *   v1 envelope, or to anything else when the Claude Cowork plugin could not answer.
 * @param {Record<string, unknown>} filter - the listing filter the caller passed (`locale`).
 * @returns {Promise<{ listings: any[], truncated: boolean, refusal: any }>}
 */
export async function walkListing(ask, filter) {
  const listings = []
  // The same filters on every call, the cursor added: a Claude Cowork plugin may sign its cursor over them
  // (EmDash does, and refuses a bare cursor), and "keep filters unchanged" is the protocol's rule.
  const first = { ...filter, limit: PAGES_LISTING_LIMIT }
  let params = first
  for (let call = 0; call < PAGES_MAX_CALLS; call += 1) {
    const answer = await ask(params)
    if (answer?.schemaVersion !== 'tracy-content/v1')
      return {
        listings,
        truncated: false,
        refusal: answer ?? {
          error: { code: 'CONTENT_SOURCE_UNAVAILABLE', message: 'The content reader did not answer.' }
        }
      }
    listings.push(answer)
    const next = answer.pagination?.nextCursor
    if (typeof next !== 'string' || next === '') return { listings, truncated: false, refusal: null }
    params = { ...first, cursor: next }
  }
  return { listings, truncated: true, refusal: null }
}

/**
 * Does the page at `pageAddress` answer the link a customer pasted? The link may lack a
 * scheme (`lantern.example/about-us`), carry tracking (`?utm_source=…`, `#team`) or a trailing
 * slash; a page whose own address needs a query (`index.php?Itemid=5`) matches only a link that
 * carries every one of those parameters.
 * @param {string} pasted
 * @param {string} pageAddress - the row's `url`.
 * @param {string | null | undefined} siteUrl
 */
export function linkShowsPage(pasted, pageAddress, siteUrl) {
  const absolute =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(pasted) || pasted.startsWith('/') ? pasted : `https://${pasted}`
  let link
  let page
  try {
    link = new URL(absolute, siteUrl ?? undefined)
    page = new URL(pageAddress, siteUrl ?? undefined)
  } catch {
    return false
  }
  const bare = (/** @type {URL} */ u) => pagePath(`${u.origin}${u.pathname}`, siteUrl)
  if (bare(link) !== bare(page)) return false
  for (const [key, value] of page.searchParams) if (link.searchParams.get(key) !== value) return false
  return true
}

/**
 * Which language a pasted link names, so `view=pages` with `url` walks ONE language: measured on dev
 * `gf1410` (EmDash Business, 40 languages, 1,720 pages), every such call took 64–70 s — the reader
 * answers each listing page in seconds and the walk needed ~18 of them — while the link
 * (`/es/investors`) already said which language to look in.
 *
 * The first path segment names a language when it is one of `locales` (any case), or the short
 * code of exactly one of them (Joomla's SEF prefix `ru` for `ru-RU`); a link with no such prefix is
 * the default language. Null when unsure — the caller then walks every language.
 * @param {string} link
 * @param {string[]} locales
 * @param {string | null} defaultLocale
 * @param {string | null | undefined} siteUrl
 * @returns {string | null}
 */
export function localeOfLink(link, locales, defaultLocale, siteUrl) {
  if (!Array.isArray(locales) || locales.length === 0) return null
  const path = pagePath(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(link) || link.startsWith('/') ? link : `https://${link}`,
    siteUrl || 'https://site.invalid'
  )
  const first = (path ?? '').split(/[/?#]/).filter(Boolean)[0]?.toLowerCase() ?? ''
  if (first !== '') {
    const exact = locales.find((locale) => locale.toLowerCase() === first)
    if (exact) return exact
    const short = locales.filter((locale) => locale.toLowerCase().split('-')[0] === first)
    if (short.length === 1) return short[0]
    if (short.length > 1) return null
  }
  return defaultLocale && locales.includes(defaultLocale) ? defaultLocale : null
}

/** Index only already-authorized rows. The final link predicate still checks required query params.
 * @param {any[]} listings
 */
export function pageAddressIndex(listings) {
  const site = listings[0]?.site?.url
  const index = new Map()
  const rows = listings.flatMap((p) => p.contents ?? [])
  rows.forEach((row, i) => {
    const key = addressKey(row.url, site)
    if (key === null) return
    if (!index.has(key)) index.set(key, [])
    index.get(key).push(i)
  })
  return index
}
/** @param {Map<string,number[]>} index @param {string|null} link @param {string|null} site */
export function indexedPageCandidates(index, link, site) {
  return link === null ? null : (index.get(addressKey(link, site)) ?? [])
}
/** @param {unknown} address @param {string|null} site */
function addressKey(address, site) {
  if (typeof address !== 'string' || !address) return null
  try {
    const absolute =
      /^[a-z][a-z0-9+.-]*:\/\//i.test(address) || address.startsWith('/') ? address : `https://${address}`
    const url = new URL(absolute, site ?? undefined)
    return pagePath(`${url.origin}${url.pathname}`, site)
  } catch {
    return null
  }
}
