/**
 * The platforms a small business keeps its links on: link-in-bio pages (Linktree, Beacons…) that list its other
 * links, and booking platforms (OpenTable, Fresha, Mindbody…) where a customer books it. Pure: no imports, only the
 * standard `URL`, so any reader of a link can use it.
 *
 * A platform is named by host: `label.*` matches any top-level domain (`treatwell.co.uk`, `treatwell.de`), a plain host
 * matches itself and its subdomains, and `host/path` matches that path prefix on the host only.
 */

/** Booking platforms, pattern -> the platform's name. */
export const BOOKING_PLATFORMS = Object.freeze({
  // Tables
  'opentable.*': 'OpenTable',
  'resy.com': 'Resy',
  'sevenrooms.com': 'SevenRooms',
  'tablecheck.com': 'TableCheck',
  'quandoo.*': 'Quandoo',
  'chope.co': 'Chope',
  'eatigo.com': 'eatigo',
  'thefork.*': 'TheFork',
  'bookatable.*': 'Bookatable',
  'exploretock.com': 'Tock',
  'tock.com': 'Tock',
  'yelp.com/reservations': 'Yelp Reservations',
  'pasaca.*': 'Pasaca',
  'zenchef.com': 'Zenchef',
  'resdiary.com': 'ResDiary',
  'covermanager.com': 'CoverManager',
  'formitable.com': 'Formitable',
  // Appointments: salons, clinics, studios, consultants
  'fresha.com': 'Fresha',
  'booksy.com': 'Booksy',
  'treatwell.*': 'Treatwell',
  'vagaro.com': 'Vagaro',
  'mindbodyonline.com': 'Mindbody',
  'mindbody.io': 'Mindbody',
  'setmore.com': 'Setmore',
  'simplybook.me': 'SimplyBook.me',
  'squareup.com/appointments': 'Square Appointments',
  'book.squareup.com': 'Square Appointments',
  'gettimely.com': 'Timely',
  'phorest.com/book': 'Phorest',
  'acuityscheduling.com': 'Acuity Scheduling',
  'calendly.com': 'Calendly',
  'planity.com': 'Planity',
  'doctolib.*': 'Doctolib',
  'styleseat.com': 'StyleSeat',
  'glossgenius.com': 'GlossGenius',
  'salonized.com': 'Salonized',
  'schedulicity.com': 'Schedulicity',
  // Classes and courts
  'playtomic.io': 'Playtomic',
  'glofox.com': 'Glofox',
  'eversports.*': 'Eversports',
  'momence.com': 'Momence',
  'goteamup.com': 'TeamUp'
})

/** Link-in-bio pages, host -> the platform's name. Its pages are `host/<handle>`, or `<handle>.host` where noted. */
export const LINK_IN_BIO_PLATFORMS = Object.freeze({
  'linktr.ee': 'Linktree',
  'beacons.ai': 'Beacons',
  'lnk.bio': 'Lnk.Bio',
  'linkin.bio': 'Linkin.bio',
  'campsite.bio': 'Campsite',
  'taplink.cc': 'Taplink',
  'tap.bio': 'Tap Bio',
  'solo.to': 'solo.to',
  'msha.ke': 'Milkshake',
  'linkpop.com': 'Linkpop',
  'allmylinks.com': 'AllMyLinks',
  'hoo.be': 'hoo.be',
  'bio.site': 'Bio Sites',
  'bio.link': 'bio.link'
})
/** Link-in-bio hosts that give each page a subdomain of its own (`<handle>.bio.site`). */
const ON_SUBDOMAIN = new Set(['bio.site', 'bio.link'])

/**
 * A platform's own pages, never a business's: its sign-in, pricing, help and company pages. The first path segment,
 * after a locale (`/en-gb/for-business`).
 */
const PLATFORM_PAGE =
  /^(?:about|about-us|admin|api|app|apps|blog|business|businesses|careers|contact|discover|download|examples|explore|features|for-business|help|jobs|legal|login|log-in|marketplace|partners?|press|pricing|privacy|register|s|search|sign-?in|sign-?up|signup|support|templates|terms)$/i
/** Subdomains of a platform that are the platform's own (its app, help centre, blog). */
const PLATFORM_SUBDOMAIN = /^(?:www|m|app|apps|help|support|blog|business|partners?|pro|status|cdn|static)$/i
const LOCALE = /^[a-z]{2}(?:[-_][a-z]{2})?$/i
const TLD_TAIL = '[a-z]{2,}(?:\\.[a-z]{2})?'

/** @param {unknown} raw @returns {URL | null} an http(s) URL */
function httpUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  try {
    const u = new URL(raw.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

/** The host of `pattern` matches `host`; returns the subdomain part before it ('' for the host itself), else null. */
function hostMatch(host, pattern) {
  if (pattern.endsWith('.*')) {
    const label = pattern.slice(0, -2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = new RegExp(`^(?:(.+)\\.)?${label}\\.${TLD_TAIL}$`).exec(host)
    return m ? (m[1] ?? '') : null
  }
  if (host === pattern) return ''
  return host.endsWith(`.${pattern}`) ? host.slice(0, -pattern.length - 1) : null
}

/** The path segments of a URL, a leading locale segment dropped. */
function segmentsOf(u) {
  const parts = u.pathname.split('/').filter(Boolean)
  return parts.length > 1 && LOCALE.test(parts[0]) ? parts.slice(1) : parts
}

/**
 * The booking platform a link is a business's page on (`BOOKING_PLATFORMS`), or null. The platform's own pages are
 * not: its home page (unless a business's own subdomain, `salon.setmore.com`), sign-in, pricing, help or company pages.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function bookingPlatformOf(raw) {
  const u = httpUrl(raw)
  if (!u) return null
  const host = u.hostname.toLowerCase()
  const path = u.pathname.toLowerCase()
  for (const [pattern, name] of Object.entries(BOOKING_PLATFORMS)) {
    const slash = pattern.indexOf('/')
    const hostPattern = slash < 0 ? pattern : pattern.slice(0, slash)
    const sub = hostMatch(host, hostPattern)
    if (sub === null) continue
    if (slash >= 0) {
      const prefix = pattern.slice(slash)
      if (path === prefix || path.startsWith(`${prefix}/`)) return name
      continue
    }
    const segments = segmentsOf(u)
    if (segments.length === 0) return sub && !PLATFORM_SUBDOMAIN.test(sub) ? name : null
    if (PLATFORM_PAGE.test(segments[0])) return null
    return name
  }
  return null
}

/**
 * Whether a link is a business's page on a booking platform (`bookingPlatformOf`).
 * @param {unknown} raw
 */
export function isBookingUrl(raw) {
  return bookingPlatformOf(raw) !== null
}

/**
 * The link-in-bio platform a link is a business's page on (`LINK_IN_BIO_PLATFORMS`): `linktr.ee/<handle>`, or a
 * subdomain page where the platform gives one. The platform's home and own pages are not. Null otherwise.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function linkInBioOf(raw) {
  const u = httpUrl(raw)
  if (!u) return null
  const host = u.hostname.toLowerCase()
  const segments = u.pathname.split('/').filter(Boolean)
  for (const [platformHost, name] of Object.entries(LINK_IN_BIO_PLATFORMS)) {
    const sub = hostMatch(host, platformHost)
    if (sub === null) continue
    if (sub === '' || sub === 'www')
      return segments.length === 1 && !PLATFORM_PAGE.test(segments[0]) ? name : null
    // A subdomain is a business's page only on the platforms that give one; elsewhere it is the platform's own.
    return ON_SUBDOMAIN.has(platformHost) && !PLATFORM_SUBDOMAIN.test(sub) && segments.length <= 1
      ? name
      : null
  }
  return null
}

/** Whether a host is a link-in-bio platform's own (the page, its CDN, its help centre): never a link the page lists. */
export function isLinkInBioHost(host) {
  const h = String(host ?? '').toLowerCase()
  return Object.keys(LINK_IN_BIO_PLATFORMS).some((p) => hostMatch(h, p) !== null)
}

/**
 * The address behind a social network's outbound redirect (`l.instagram.com/?u=…`, `l.facebook.com/l.php?u=…`,
 * `google.com/url?q=…`), else the link as it was.
 * @param {string} raw
 * @returns {string}
 */
export function unwrapRedirect(raw) {
  const u = httpUrl(raw)
  if (!u) return raw
  const host = u.hostname.toLowerCase()
  let inner = null
  if (host === 'l.instagram.com') inner = u.searchParams.get('u')
  else if (/^(?:l|lm)\.facebook\.com$/.test(host) && u.pathname === '/l.php') inner = u.searchParams.get('u')
  else if (/^(?:www\.)?google\.[a-z.]+$/.test(host) && u.pathname === '/url')
    inner = u.searchParams.get('q') ?? u.searchParams.get('url')
  return inner && httpUrl(inner) ? inner : raw
}
