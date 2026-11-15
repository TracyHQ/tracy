// What each trade's customers expect to do on its website (a restaurant's menu, a salon's booking…), and which of these
// the business's CURRENT website offers, read only from what research already collected about that site: the website
// source's pages (address and title), the menus and the booking links the crawler found (`website-crawler.mjs`).
// Nothing here fetches anything; this module is pure and imports nothing, so the browser client can use it too.
//
// 🔒 UNKNOWN IS UNKNOWN, NEVER "MISSING". A must-have is `missing` only when the read could have seen it and did not:
// the read went through the whole site (`complete`), and what the read keeps shows that capability whichever common way
// a site offers it. Where it does not (an ordering platform's link is not kept, forms are not collected at all, an
// appointment platform's link is kept only for restaurant table bookings), a capability that was not found is
// `unknown`, with the reason. A claim "your site has no booking" to a business that has one costs more than no claim.

export const TRADE_MUST_HAVES_VERSION = 'trade-must-haves/1'

/** What a site can offer a customer, as this module names it. */
export const CAPABILITIES = Object.freeze(['menu', 'booking', 'ordering', 'schedule', 'form'])

/**
 * Each trade's must-haves (`trades.mjs` trade ids): one must-have is met by any of its capabilities (`anyOf`). A trade
 * that is not listed has none. `bySubTrade` narrows a trade for one of its sub-trades (`sub-trades.mjs`): a pharmacy
 * takes no appointments, a coach who teaches at other venues publishes no class timetable.
 */
export const TRADE_MUST_HAVES = Object.freeze({
  food: Object.freeze([
    Object.freeze({ id: 'menu', anyOf: Object.freeze(['menu']) }),
    Object.freeze({ id: 'booking-or-ordering', anyOf: Object.freeze(['booking', 'ordering']) })
  ]),
  beauty: Object.freeze([Object.freeze({ id: 'booking', anyOf: Object.freeze(['booking']) })]),
  health: Object.freeze([
    Object.freeze({ id: 'appointment-booking', anyOf: Object.freeze(['booking']) }),
    Object.freeze({ id: 'contact-form', anyOf: Object.freeze(['form']) })
  ]),
  fitness: Object.freeze([
    Object.freeze({ id: 'class-schedule', anyOf: Object.freeze(['schedule']) }),
    Object.freeze({ id: 'booking', anyOf: Object.freeze(['booking']) })
  ]),
  hospitality: Object.freeze([Object.freeze({ id: 'booking', anyOf: Object.freeze(['booking']) })])
})

const BY_SUB_TRADE = Object.freeze({
  health: Object.freeze({ pharmacy: Object.freeze([]) }),
  fitness: Object.freeze({ coaching: Object.freeze(['booking']) })
})

/**
 * The must-haves of a trade, narrowed by its sub-trade when one is known.
 * @param {string | null | undefined} trade @param {string | null | undefined} [subTrade]
 * @returns {ReadonlyArray<{id: string, anyOf: readonly string[]}>}
 */
export function mustHavesOf(trade, subTrade = null) {
  const all = typeof trade === 'string' ? (TRADE_MUST_HAVES[trade] ?? []) : []
  const keep = typeof subTrade === 'string' ? BY_SUB_TRADE[trade]?.[subTrade] : undefined
  return keep ? all.filter((m) => keep.includes(m.id)) : all
}

// A page whose address or title says it is the capability. The menu and booking words are the crawler's own
// (`website-crawler.mjs` MENU_PAGE, BOOKING_PAGE), with appointment words added for the trades that book visits.
const PAGE_SIGNS = Object.freeze({
  menu: /(^|[/_-])(menu|menus|thuc-don|carte|speisekarte)([/_.-]|$)|\b(menu|th\u1ef1c \u0111\u01a1n)\b/i,
  booking:
    /(^|[/_-])(book|booking|bookings|book-online|reserv|reservation|reservations|dat-ban|dat-lich|appointment|appointments|termin|termine)([/_.-]|$)|\b(book (a|an|your) (table|appointment|room|class|treatment|visit)|book online|book now|reservations?|appointments?)\b|\u0111\u1eb7t (b\u00e0n|l\u1ecbch)/i,
  ordering:
    /(^|[/_-])(order|order-online|online-order|ordering|delivery|takeaway|take-away|dat-mon)([/_.-]|$)|\b(order online|order now|delivery|takeaway)\b/i,
  schedule:
    /(^|[/_-])(schedule|timetable|class-schedule|classes|stundenplan|kursplan|lich-tap)([/_.-]|$)|\b(class schedule|timetable)\b/i
})
// The words a page's own text uses when it offers the capability in place (a one-page site's menu section, a "Book a
// table" line). Only ever evidence that it is there: a word that is absent proves nothing. The non-English words are
// written as escapes (the Vietnamese "menu", "book a table", "book an appointment"; the French "a la carte").
const TEXT_SIGNS = Object.freeze({
  menu: /\b(menu|menus|a la carte|speisekarte|th\u1ef1c \u0111\u01a1n)\b|\u00e0 la carte/i,
  booking:
    /\b(book (a|an|your) (table|appointment|room|class|treatment|visit)|book online|book now|reserve (a|your) table|reservations?|appointments?)\b|\u0111\u1eb7t (b\u00e0n|l\u1ecbch)/i,
  ordering: /\b(order online|order now|delivery|takeaway|take-away)\b/i,
  schedule: /\b(class schedule|timetable|weekly schedule)\b/i
})

/**
 * Whether a read that went through the whole site and did not find a capability shows it is absent. The menu: the
 * crawler keeps menu pages, menu PDFs and the schema.org menu of every page. A booking: the crawler keeps the links to
 * the table-booking platforms (OpenTable, SevenRooms, TheFork…) and the site's own booking pages, which is every common
 * way for a restaurant, not for a salon, clinic, gym or hotel (their platforms' links are not kept). Ordering links and
 * timetable widgets are not kept, and forms are not collected at all.
 */
const ABSENCE_SEEN = Object.freeze({
  menu: () => true,
  booking: (trade) => trade === 'food',
  ordering: () => false,
  schedule: () => false,
  form: () => false
})

const pathOf = (raw) => {
  try {
    return new URL(String(raw)).pathname
  } catch {
    return ''
  }
}

const urlsOf = (list) =>
  (Array.isArray(list) ? list : [])
    .map((x) => (typeof x === 'string' ? x : x?.url))
    .filter((u) => typeof u === 'string' && u.trim())

/**
 * The old site's read as this module takes it, from the website source row research wrote (`executor.js`
 * `mergeCollected`): `{status, collected: {pages: [{url, title, text}], menus: [{url}], bookings: [{url}]}}`, or null.
 * @param {any} row
 * @returns {{state: 'complete' | 'partial' | 'failed' | 'none', pages: {url: string, title: string, text: string}[],
 *   menus: string[], bookings: string[]}}
 */
export function oldSiteReadOf(row) {
  const collected = row?.collected && typeof row.collected === 'object' ? row.collected : {}
  const pages = (Array.isArray(collected.pages) ? collected.pages : [])
    .filter((p) => typeof p?.url === 'string')
    .map((p) => ({
      url: p.url,
      title: typeof p.title === 'string' ? p.title : '',
      text: typeof p.text === 'string' ? p.text : ''
    }))
  const status = row?.status
  // A read that kept no page read nothing, whatever its status says.
  const state =
    status === 'failed'
      ? 'failed'
      : !pages.length
        ? 'none'
        : status === 'complete'
          ? 'complete'
          : status === 'partial'
            ? 'partial'
            : 'none'
  return { state, pages, menus: urlsOf(collected.menus), bookings: urlsOf(collected.bookings) }
}

/**
 * Where the read shows one capability: the crawler's own lists first, then the pages whose address or title says it,
 * then the pages whose text offers it in place.
 */
function evidenceOf(capability, read) {
  const found = new Set(capability === 'menu' ? read.menus : capability === 'booking' ? read.bookings : [])
  const page = PAGE_SIGNS[capability]
  const text = TEXT_SIGNS[capability]
  if (page) for (const p of read.pages) if (page.test(pathOf(p.url)) || page.test(p.title)) found.add(p.url)
  if (text) for (const p of read.pages) if (text.test(p.text)) found.add(p.url)
  return [...found].slice(0, 5)
}

/** One capability of the old site: present (with where), missing, or unknown (with why). */
function offerOf(capability, trade, read) {
  const evidence = evidenceOf(capability, read)
  if (evidence.length) return { state: 'present', evidence }
  if (capability === 'form') return { state: 'unknown', reason: 'not-collected' }
  if (read.state === 'none') return { state: 'unknown', reason: 'no-read' }
  if (read.state === 'failed') return { state: 'unknown', reason: 'read-failed' }
  if (read.state === 'partial') return { state: 'unknown', reason: 'read-incomplete' }
  if (!ABSENCE_SEEN[capability](trade)) return { state: 'unknown', reason: 'not-detectable' }
  return { state: 'missing' }
}

/**
 * The trade's must-haves on the business's current website. Null when the trade has none, or the place has no
 * website of its own (the no-website score is that place's).
 * @param {{trade?: string | null, subTrade?: string | null, website?: string | null, read?: ReturnType<typeof oldSiteReadOf>}} input
 * @returns {null | {version: string, trade: string, subTrade: string | null, read: string,
 *   offers: Record<string, {state: 'present' | 'missing' | 'unknown', evidence?: string[], reason?: string}>,
 *   mustHaves: {id: string, anyOf: string[], state: 'present' | 'missing' | 'unknown', reason?: string}[]}}
 */
export function assessMustHaves({ trade = null, subTrade = null, website = null, read = null } = {}) {
  const wanted = mustHavesOf(trade, subTrade)
  if (!wanted.length || !website) return null
  const seen = read ?? oldSiteReadOf(null)
  const offers = {}
  for (const m of wanted) for (const cap of m.anyOf) offers[cap] ??= offerOf(cap, trade, seen)
  const mustHaves = wanted.map((m) => {
    const states = m.anyOf.map((cap) => offers[cap])
    if (states.some((o) => o.state === 'present')) return { id: m.id, anyOf: [...m.anyOf], state: 'present' }
    if (states.every((o) => o.state === 'missing')) return { id: m.id, anyOf: [...m.anyOf], state: 'missing' }
    const why = states.find((o) => o.state === 'unknown')?.reason ?? 'not-detectable'
    return { id: m.id, anyOf: [...m.anyOf], state: 'unknown', reason: why }
  })
  return {
    version: TRADE_MUST_HAVES_VERSION,
    trade,
    subTrade: typeof subTrade === 'string' ? subTrade : null,
    read: seen.state,
    offers,
    mustHaves
  }
}

/**
 * What the demo built from a brief offers, from the brief alone: a booking only when the brief holds a verified
 * booking link, a menu only when its sitemap has the full menu section (not the posted-dishes stand-in). Everything
 * else is not claimed.
 * @param {any} brief
 * @returns {Record<string, boolean>}
 */
export function demoOffersOfBrief(brief) {
  const integrations = Array.isArray(brief?.integrations) ? brief.integrations : []
  const sitemap = Array.isArray(brief?.sitemap) ? brief.sitemap : []
  const missing = Array.isArray(brief?.missing) ? brief.missing : []
  const booking = integrations.some(
    (x) => x?.kind === 'booking' && x.verified === true && typeof x.url === 'string' && x.url.trim()
  )
  const menu =
    !missing.some((m) => m?.field === 'menu') &&
    sitemap.some(
      (page) => Array.isArray(page?.sections) && page.sections.some((section) => section?.kind === 'menu')
    )
  return { menu, booking, ordering: false, schedule: false, form: false }
}

/** The outreach line of each capability the old site lacks and the demo has. English data, said to the business. */
const ARGUMENT_TEXT = Object.freeze({
  menu: 'Your site has no online menu; the demo does.',
  booking: 'Your site has no online booking; the demo does.',
  ordering: 'Your site has no online ordering; the demo does.',
  schedule: 'Your site has no class schedule; the demo does.',
  form: 'Your site has no contact form; the demo does.'
})

/**
 * One outreach argument per capability the old site is known to lack (`missing`, never `unknown`) and the demo really
 * offers (`demoOffersOfBrief`). A capability a must-have names is argued for even when its must-have as a whole is
 * unknown: "no online booking" is true of a restaurant whose ordering could not be read.
 * @param {ReturnType<typeof assessMustHaves>} assessment
 * @param {Record<string, boolean> | null} demo
 * @returns {{capability: string, mustHave: string, key: string, text: string}[]}
 */
export function mustHaveArguments(assessment, demo) {
  if (!assessment || !demo) return []
  const out = []
  for (const m of assessment.mustHaves) {
    for (const cap of m.anyOf) {
      if (assessment.offers[cap]?.state !== 'missing' || demo[cap] !== true) continue
      if (out.some((a) => a.capability === cap)) continue
      out.push({ capability: cap, mustHave: m.id, key: `mustHave.missing.${cap}`, text: ARGUMENT_TEXT[cap] })
    }
  }
  return out
}
