/**
 * The contact lines of a Joomla site's custom modules (a footer's phone, a contact strip), written from the site plan's
 * contact facts (spec TracyHQ/tracy#189, ticket #191) and linked the way a visitor uses them.
 *
 * 🔒 A CONTACT LINE IS THE BUSINESS'S DOOR. Measured 29/10/2026 on a brief build of a Joomla T4 template: the footer's phone
 * link led to `#` and the demo's mailbox stayed, while the brief held a phone, an address and WhatsApp. In every module's
 * HTML, a link that calls or mails (`tel:`, `mailto:`) or shows a phone number or a mailbox behind an empty link (`#`)
 * leads to the business's own phone or mailbox and shows it. A mailbox or phone of the demo with no fact of that kind in
 * the brief is taken off, never left standing for the business. A WhatsApp number the brief holds is linked beside the
 * phone (`https://wa.me/`), or in place of a WhatsApp link the template had.
 *
 * Framework-wide (Joomla custom modules), never per template: it reads the HTML, not a module id or a template's files.
 */

/** A phone number as a page shows one. */
const PHONE = /\(?\+?\d[\d\s().-]{4,}\d/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
/** An `<a>` element, its attributes and what it shows. */
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
const HREF = /(\shref\s*=\s*)(["'])([\s\S]*?)\2/i
const NUMBER_DIGITS = 6

const digits = (/** @type {string} */ s) => s.replace(/\D+/g, '')
const escapeHtml = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * @typedef {{ value: string, href?: string }} ContactFact
 * @typedef {{ phone?: ContactFact, email?: ContactFact, whatsapp?: ContactFact, address?: ContactFact, serviceArea?: ContactFact }} Contact
 */

/** What a link calls, mails or messages, read from its `href` and the words it shows. */
function kindOf(/** @type {string} */ href, /** @type {string} */ shows) {
  const h = href.replace(/&amp;/g, '&').trim()
  if (/^mailto:/i.test(h)) return 'email'
  if (/^tel:/i.test(h)) return 'phone'
  if (/wa\.me\/|api\.whatsapp\.com|whatsapp:/i.test(h)) return 'whatsapp'
  if (h !== '' && h !== '#') return null
  const text = shows.replace(/<[^>]*>/g, ' ')
  if (new RegExp(EMAIL.source).test(text)) return 'email'
  if ((text.match(PHONE) ?? []).some((n) => digits(n).length >= NUMBER_DIGITS)) return 'phone'
  return null
}

/** Whether a link already leads to the business's own fact. */
function isOwn(/** @type {string} */ href, /** @type {ContactFact} */ fact) {
  return href.replace(/&amp;/g, '&').trim().toLowerCase() === String(fact.href ?? '').toLowerCase()
}

/** The words a link shows with the demo's number or mailbox said as the business's. */
function showOwn(
  /** @type {string} */ inner,
  /** @type {'phone'|'email'|'whatsapp'} */ kind,
  /** @type {string} */ value
) {
  const shown = escapeHtml(value)
  return inner.replace(/(<[^>]*>)|([^<]+)/g, (_whole, tag, text) => {
    if (tag) return tag
    if (kind === 'email') return text.replace(EMAIL, shown)
    return text.replace(PHONE, (/** @type {string} */ found) =>
      digits(found).length >= NUMBER_DIGITS ? shown : found
    )
  })
}

/** A link that opens a map: a maps address, or an empty link whose words say map, directions or where to find the business. */
const MAP_WORDS = /\b(?:map|directions?|find us|get there|location)\b/i
const MAP_HREF =
  /^https?:\/\/(?:www\.)?(?:maps\.google\.|google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?openstreetmap\.org)/i

/** One link: a map link of the template pointed at the business's own pin; the link is left alone when the brief holds none. */
function retargetMapLink(
  /** @type {string} */ whole,
  /** @type {string} */ attrs,
  /** @type {string} */ inner,
  /** @type {Contact} */ contact
) {
  const href = (HREF.exec(attrs)?.[3] ?? '').replace(/&amp;/g, '&').trim()
  const shows = inner.replace(/<[^>]*>/g, ' ')
  const isMap = MAP_HREF.test(href) || ((href === '' || href === '#') && MAP_WORDS.test(shows))
  const pin = contact.address?.href
  if (!isMap || !pin || href === pin) return null
  const next = HREF.test(attrs)
    ? attrs.replace(HREF, (_m, lead, quote) => `${lead}${quote}${escapeHtml(pin)}${quote}`)
    : `${attrs} href="${escapeHtml(pin)}"`
  return `<a${next}>${inner}</a>`
}

/** The areas served as one more line beside the address, in the address line's own tag and class: nothing new is drawn. */
function addAreaLine(/** @type {string} */ html, /** @type {Contact} */ contact) {
  const address = contact.address?.value
  const area = contact.serviceArea?.value
  if (!address || !area || html.includes(escapeHtml(area))) return { html, added: 0 }
  const flat = (/** @type {string} */ t) => t.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  let added = 0
  const out = html.replace(/<(p|div|li|span)\b([^>]*)>([^<]*)<\/\1>/gi, (whole, tag, attrs, inner) => {
    if (added || flat(inner) !== flat(address)) return whole
    added = 1
    return `${whole}<${tag}${attrs}>${escapeHtml(area)}</${tag}>`
  })
  return { html: out, added }
}

/**
 * One module's HTML with its contact links leading to the business.
 * @param {string} html
 * @param {Contact} contact - the site plan's contact facts
 * @returns {{ html: string, moved: number, removed: number, added: number }}
 */
export function joomlaContactLinks(html, contact) {
  let moved = 0
  let removed = 0
  let added = 0
  let phoneLinked = false
  let whatsappLinked = false
  let out = String(html ?? '').replace(ANCHOR, (whole, attrs, inner) => {
    const href = HREF.exec(attrs)?.[3] ?? ''
    const kind = kindOf(href, inner)
    if (!kind) {
      const pinned = retargetMapLink(whole, attrs, inner, contact)
      if (pinned) moved += 1
      return pinned ?? whole
    }
    const fact = contact[kind]
    if (kind === 'phone' && fact) phoneLinked = true
    if (kind === 'whatsapp' && fact) whatsappLinked = true
    if (fact && isOwn(href, fact)) return whole
    if (!fact) {
      // The demo's number or mailbox with nothing of the business's to stand in its place: taken off.
      removed += 1
      return ''
    }
    moved += 1
    const next = HREF.test(attrs)
      ? attrs.replace(HREF, (_m, lead, quote) => `${lead}${quote}${escapeHtml(fact.href ?? '')}${quote}`)
      : `${attrs} href="${escapeHtml(fact.href ?? '')}"`
    return `<a${next}>${kind === 'whatsapp' ? inner : showOwn(inner, kind, fact.value)}</a>`
  })
  // A mailbox the module shows as plain words: the business's, or none.
  out = out.replace(/(<[^>]*>)|([^<]+)/g, (_whole, tag, text) => {
    if (tag) return tag
    return text.replace(EMAIL, (/** @type {string} */ found) => {
      if (contact.email && found.toLowerCase() === contact.email.value.toLowerCase()) return found
      if (contact.email) moved += 1
      else removed += 1
      return contact.email ? escapeHtml(contact.email.value) : ''
    })
  })
  // WhatsApp beside the phone, once, where the module calls the business and has no WhatsApp link yet.
  if (contact.whatsapp?.href && phoneLinked && !whatsappLinked) {
    let done = false
    out = out.replace(/<a\b[^>]*\shref\s*=\s*(["'])tel:[^"']*\1[^>]*>[\s\S]*?<\/a\s*>/i, (link) => {
      done = true
      return `${link} <a href="${escapeHtml(contact.whatsapp?.href ?? '')}" target="_blank" rel="noopener">WhatsApp</a>`
    })
    if (done) added += 1
  }
  const areaLine = addAreaLine(out, contact)
  return { html: areaLine.html, moved, removed, added: added + areaLine.added }
}

/**
 * The module writes that point every published module's contact lines at the business (`content.batch` steps).
 * @param {object} input
 * @param {Array<{ id: number | string, published?: number | string, language?: string, content?: unknown }>} input.modules
 * @param {Contact | null | undefined} input.contact - the site plan's contact facts; none = nothing written
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @returns {{ steps: Array<{ kind: 'module', id: number, fields: { content: string } }>, moved: number, removed: number, added: number }}
 */
export function moduleContactSteps({ modules, contact, visible }) {
  const steps = []
  let moved = 0
  let removed = 0
  let added = 0
  if (!contact) return { steps, moved, removed, added }
  for (const row of modules) {
    const language = String(row.language ?? '*')
    if (Number(row.published) !== 1 || (language !== '*' && !visible.has(language))) continue
    if (typeof row.content !== 'string' || row.content === '') continue
    const next = joomlaContactLinks(row.content, contact)
    if (next.html === row.content) continue
    steps.push({ kind: 'module', id: Number(row.id), fields: { content: next.html } })
    moved += next.moved
    removed += next.removed
    added += next.added
  }
  return { steps, moved, removed, added }
}
