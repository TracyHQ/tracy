// The checker of a repair the customer cannot see (spec #418): a link target, a phone or e-mail link, a picture's alt, a
// page's title or meta description. A screenshot shows none of them, so such a repair is never judged on crops by the
// checker model: it is confirmed by reading the page the site serves now (the same page read that confirms an invisible
// site check failure, fault-sources.js) and kept only when that page serves the new value. A repair the customer sees
// stays with the checker on before and after crops. Pure, but for the page read it is handed.

/** Order kinds whose change is never on screen. */
const UNSEEN_ORDERS = new Set(['fix-link', 'fix-alt', 'fix-title-meta'])
/** A slot value that is an address: what it changes is where a link leads, not what it shows. */
const ADDRESS = /^(tel:|mailto:|https?:|\/|#|index\.php)/i
const CONTACT = /^(tel|mailto):/i

const squash = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
const decoded = (html) =>
  String(html)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
const digits = (s) => String(s).replace(/\D+/g, '')

/** The values of one attribute on the page, quoted or not, entities decoded. */
const attributeValues = (html, name) =>
  [...String(html).matchAll(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'gi'))].map(
    (m) => decoded(m[1] ?? m[2] ?? m[3] ?? '')
  )

/** Every link target on the page. */
export const hrefsIn = (html) => attributeValues(html, 'href')

/** Whether a repair changes nothing the customer sees, so the live page, not the checker, proves it. */
export const isUnseenRepair = (order, valid) =>
  UNSEEN_ORDERS.has(order?.kind) || ADDRESS.test(String(valid?.current ?? '').trim())

/** A link target without its origin and its outer slashes, so a site's own address compares with a path. */
const bareTarget = (href) =>
  String(href)
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+|\/+$/g, '')

const schemeOf = (value) => value.match(CONTACT)?.[1]?.toLowerCase() ?? null

/** A test of a link target: the same tel: number, digits compared, or the same mailto: address. */
function sameContact(value) {
  const scheme = schemeOf(value)
  const rest = value.slice(scheme.length + 1)
  return (href) => {
    if (schemeOf(href) !== scheme) return false
    const theirs = href.slice(scheme.length + 1)
    if (scheme === 'tel') return digits(theirs) === digits(rest)
    try {
      return decodeURIComponent(theirs).toLowerCase() === rest.toLowerCase()
    } catch {
      return theirs.toLowerCase() === rest.toLowerCase()
    }
  }
}

/** Whether the page serves a tel: or mailto: link to the new value, or, when the item was removed, no link to the old one. */
function servesContact(hrefs, after, current) {
  const rest = CONTACT.test(after) ? after.slice(schemeOf(after).length + 1) : ''
  const named = schemeOf(after) === 'tel' ? digits(rest) : rest.trim()
  if (named) return hrefs.some(sameContact(after))
  return CONTACT.test(current) && !hrefs.some(sameContact(current))
}

/**
 * Whether the page the site serves now holds the repair's new value.
 * @param {string} html the page as the site serves it now
 * @param {{ order: object, valid: { current: string, after: string } }} repair
 */
export function servesRepair(html, { order, valid }) {
  const after = String(valid.after ?? '')
  if (order.kind === 'fix-title-meta') {
    if (order.field === 'title') {
      const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html))?.[1]
      return title !== undefined && squash(decoded(title)).includes(squash(after))
    }
    const metas = [...String(html).matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0])
    return metas.some(
      (tag) =>
        /\sname\s*=\s*["']?description["'\s>]/i.test(tag) &&
        attributeValues(tag, 'content').some((v) => squash(v) === squash(after))
    )
  }
  if (order.kind === 'fix-alt') return attributeValues(html, 'alt').some((v) => squash(v) === squash(after))
  const hrefs = hrefsIn(html)
  if (CONTACT.test(after) || CONTACT.test(String(valid.current ?? '')))
    return servesContact(hrefs, after, String(valid.current ?? ''))
  // A link to a page the site keeps may be printed at its routed address rather than as written (Joomla's router).
  const wanted = new Set([bareTarget(after)])
  if (order.kind === 'fix-link' && typeof order.to === 'string') {
    const to = bareTarget(order.to)
    for (const target of [to, `index.php/${to}`, to ? `index.php/${to}` : 'index.php'])
      wanted.add(bareTarget(target))
  }
  return hrefs.some((h) => wanted.has(bareTarget(h)))
}

/**
 * The live page's verdict on an unseen repair, as the checker's would be.
 * @param {((page: string) => Promise<string | null>) | null} pageHtml
 * @returns {Promise<{ verdict: 'better' | 'not better', reason: string }>}
 */
export async function liveVerdict(pageHtml, fault, repair) {
  if (typeof pageHtml !== 'function')
    return {
      verdict: 'not better',
      reason: 'the live page could not be read, so a repair no screenshot shows is not proven'
    }
  const html = await pageHtml(fault.page).catch(() => null)
  if (typeof html !== 'string')
    return {
      verdict: 'not better',
      reason: `the live page ${fault.page} could not be read, so the repair is not proven`
    }
  return servesRepair(html, repair)
    ? { verdict: 'better', reason: `the live page ${fault.page} serves the new value` }
    : { verdict: 'not better', reason: `the live page ${fault.page} does not serve the new value` }
}
