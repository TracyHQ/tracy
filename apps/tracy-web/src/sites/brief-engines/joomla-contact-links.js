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
import { lineOf, placeLines } from './joomla-contact-lines.js'

/** A phone number as a page shows one. */
const PHONE = /\(?\+?\d[\d\s().-]{4,}\d/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
/** An `<a>` element, its attributes and what it shows. */
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
const HREF = /(\shref\s*=\s*)(["'])([\s\S]*?)\2/i
const NUMBER_DIGITS = 6

/** The link of a chat app on a number (`messaging-apps.mjs` in the domain): WhatsApp, Zalo. */
const APP_HREF = Object.freeze({
  whatsapp: /wa\.me\/|api\.whatsapp\.com|whatsapp:/i,
  zalo: /zalo\.me\//i
})
const isApp = (/** @type {string} */ kind) => kind in APP_HREF
/** Bootstrap's spacing and display classes: the gap a template gives a contact line. */
const SPACING = /^(?:[mp][tbsexy]?-(?:\d|auto)|d-(?:block|flex|inline-block|grid))$/

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
  for (const [app, re] of Object.entries(APP_HREF)) if (re.test(h)) return app
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
  /** @type {'phone'|'email'|'whatsapp'|'zalo'} */ kind,
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
function addAreaLine(
  /** @type {string} */ html,
  /** @type {Contact} */ contact,
  /** @type {string[]} */ bound = []
) {
  const address = contact.address?.value
  const area = contact.serviceArea?.value
  if (!address || !area || html.includes(escapeHtml(area))) return { html, added: 0 }
  const flat = (/** @type {string} */ t) => t.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
  const line = /<(p|div|li|span)\b([^>]*)>([^<]*)<\/\1>/gi
  for (const m of html.matchAll(line)) {
    // The address line, whole or cut short by whole parts for its box (`addressThatFits` in the domain).
    const shown = flat(m[3])
    const whole = flat(address)
    const cut = whole.startsWith(shown) && /^\s*[-\u2013\u2014,]/.test(whole.slice(shown.length))
    if (shown === '' || !(shown === whole || cut)) continue
    const [found, tag, attrs] = m
    const at = /** @type {number} */ (m.index) + found.length
    const placed = placeLines({
      html,
      line: { start: /** @type {number} */ (m.index), end: at, tag: null, open: '' },
      links: [`<${tag}${attrs.replace(/\sid\s*=\s*(["'])[^"']*\1/i, '')}>${escapeHtml(area)}</${tag}>`],
      bound
    })
    // The line is a sibling, not a link: no space between block lines.
    return placed
      ? { html: placed.replace(`${found} <${tag}`, `${found}<${tag}`), added: 1 }
      : { html, added: 0 }
  }
  return { html, added: 0 }
}

/**
 * @typedef {{ kind: 'phone' | 'whatsapp' | 'zalo' | 'message', value: string, href: string, label: string }} Channel
 */

/** The channels of a plan that has none listed: its phone and its WhatsApp. */
function channelsOfContact(/** @type {Contact} */ contact) {
  /** @type {Channel[]} */
  const out = []
  if (contact.phone?.href)
    out.push({
      kind: 'phone',
      value: contact.phone.value,
      href: contact.phone.href,
      label: `Call ${contact.phone.value}`
    })
  if (contact.whatsapp?.href)
    out.push({
      kind: 'whatsapp',
      value: contact.whatsapp.value,
      href: contact.whatsapp.href,
      label: 'WhatsApp us'
    })
  return out
}

const textOf = (/** @type {string} */ inner) =>
  inner
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
const outside = (/** @type {string} */ href) =>
  /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : ''
/** A link's attributes with its target taken off: what a clone of it keeps (its class, its style hooks). */
const ownAttrs = (/** @type {string} */ attrs) =>
  attrs.replace(/\s(?:href|target|rel|id)\s*=\s*(["'])[\s\S]*?\1/gi, '').replace(/\s+$/, '')

/** A link with its target set to `href` (and opened apart when it leaves the site). */
function pointed(/** @type {string} */ attrs, /** @type {string} */ href) {
  const set = HREF.test(attrs)
    ? attrs.replace(HREF, (_m, lead, quote) => `${lead}${quote}${escapeHtml(href)}${quote}`)
    : ` href="${escapeHtml(href)}"${attrs}`
  return /\starget\s*=/i.test(set) ? set : `${set}${outside(href)}`
}

/**
 * One module's HTML with its contact links leading to the business, and every channel of the brief it does not show yet
 * added beside its phone line (COO rule 29/10/2026), without moving a bound node (`joomla-contact-lines.js`).
 * @param {string} html
 * @param {Contact} contact - the site plan's contact facts
 * @param {{ channels?: Channel[] | null, bound?: string[] }} [options] - the plan's channels, and the content map's paths
 *   into this HTML
 * @returns {{ html: string, moved: number, removed: number, added: number }}
 */
export function joomlaContactLinks(html, contact, { channels = null, bound = [] } = {}) {
  const facts = contact ?? {}
  const reach = channels ?? channelsOfContact(facts)
  const phones = reach.filter((c) => c.kind === 'phone')
  const appOf = (/** @type {string} */ kind) =>
    reach.find((c) => c.kind === kind) ?? (kind === 'whatsapp' ? (facts.whatsapp ?? null) : null)
  /** @type {Map<string, Channel>} */
  const byLabel = new Map(reach.filter((c) => c.kind !== 'phone').map((c) => [c.label.toLowerCase(), c]))
  let moved = 0
  let removed = 0
  let added = 0
  const source = String(html ?? '')
  // The business's own numbers the block already shows: a demo number takes one it does not show yet.
  const used = new Set()
  const ownOf = (/** @type {string} */ text) =>
    phones.find((p) => (text.match(PHONE) ?? []).some((n) => digits(n) === digits(p.value))) ?? null
  for (const m of source.matchAll(ANCHOR)) {
    const own = ownOf(textOf(m[2]))
    if (own) used.add(own.href)
  }
  let out = source.replace(ANCHOR, (whole, attrs, inner) => {
    const href = HREF.exec(attrs)?.[3] ?? ''
    const kind = kindOf(href, inner)
    if (!kind) {
      // A line the plan wrote with a channel's words ("Message us on Instagram") leads to that channel.
      const channel = byLabel.get(textOf(inner).toLowerCase())
      if (channel) {
        if (href.replace(/&amp;/g, '&').trim() === channel.href) return whole
        moved += 1
        return `<a${pointed(attrs, channel.href)}>${inner}</a>`
      }
      const pinned = retargetMapLink(whole, attrs, inner, facts)
      if (pinned) moved += 1
      return pinned ?? whole
    }
    if (kind === 'phone') {
      const own = ownOf(textOf(inner))
      const phone = own ?? phones.find((p) => !used.has(p.href)) ?? phones[0]
      if (!phone) {
        removed += 1
        return ''
      }
      used.add(phone.href)
      if (isOwn(href, phone) && own) return whole
      moved += 1
      return `<a${pointed(attrs, phone.href)}>${own ? inner : showOwn(inner, 'phone', phone.value)}</a>`
    }
    const fact = isApp(kind) ? appOf(kind) : facts.email
    if (fact && isOwn(href, fact)) return whole
    if (!fact) {
      // The demo's mailbox or chat app with nothing of the business's to stand in its place: taken off.
      removed += 1
      return ''
    }
    moved += 1
    const next = HREF.test(attrs)
      ? attrs.replace(HREF, (_m, lead, quote) => `${lead}${quote}${escapeHtml(fact.href ?? '')}${quote}`)
      : `${attrs} href="${escapeHtml(fact.href ?? '')}"`
    return `<a${next}>${isApp(kind) ? inner : showOwn(inner, kind, fact.value)}</a>`
  })
  // A mailbox the module shows as plain words: the business's, or none.
  out = out.replace(/(<[^>]*>)|([^<]+)/g, (_whole, tag, text) => {
    if (tag) return tag
    return text.replace(EMAIL, (/** @type {string} */ found) => {
      if (facts.email && found.toLowerCase() === facts.email.value.toLowerCase()) return found
      if (facts.email) moved += 1
      else removed += 1
      return facts.email ? escapeHtml(facts.email.value) : ''
    })
  })
  // Every number, then the chat apps, right after the call line; the area beside the address; the DMs after the last line.
  const lines = missingLines(out, reach)
  for (const part of [lines?.reach, 'area', lines?.messages]) {
    if (part === 'area') {
      const areaLine = addAreaLine(out, facts, bound)
      out = areaLine.html
      added += areaLine.added
      continue
    }
    const at = part ? lineAfter(out, part.after) : null
    if (!part || !at) continue
    const placed = placeLines({ html: out, line: at, links: part.links, bound })
    if (placed) {
      out = placed
      added += part.links.length
    }
  }
  return { html: out, moved, removed, added }
}

/** The anchors of a block, each with its span, attributes, target and words. */
function anchorsOf(/** @type {string} */ html) {
  return [...html.matchAll(ANCHOR)].map((m) => ({
    start: /** @type {number} */ (m.index),
    end: /** @type {number} */ (m.index) + m[0].length,
    attrs: m[1],
    href: (HREF.exec(m[1])?.[3] ?? '').replace(/&amp;/g, '&').trim(),
    text: textOf(m[2])
  }))
}

/** The line new lines follow, found again in the block as it is now: `'call'` its last call line, `'last'` its last link. */
function lineAfter(/** @type {string} */ html, /** @type {'call' | 'last'} */ which) {
  const anchors = anchorsOf(html).filter((a) => a.text !== '')
  const calls = anchors.filter((a) => /^tel:/i.test(a.href))
  const contact = anchors.filter((a) => /^(?:tel:|mailto:|https?:)/i.test(a.href))
  const after = which === 'call' ? (calls.at(-1) ?? contact.at(-1)) : (contact.at(-1) ?? calls.at(-1))
  if (!after) return null
  // A bare last link with only lines of words after it (the address, the area): the DMs go after those lines.
  if (
    which === 'last' &&
    lineOf(html, after.start, after.end).tag === null &&
    !/<a\b/i.test(html.slice(after.end))
  )
    return { start: after.end, end: html.length, tag: null, open: '' }
  return lineOf(html, after.start, after.end)
}

/** A clone's attributes with the spacing of the line it follows (`mb-3`, its own line), so every line keeps one gap. */
function spacedLike(/** @type {string} */ attrs, /** @type {string} */ like) {
  const classes = (/** @type {string} */ a) =>
    (/\sclass\s*=\s*(["'])([^"']*)\1/i.exec(a)?.[2] ?? '').split(/\s+/).filter(Boolean)
  const own = classes(attrs)
  const shown = own.some((c) => c.startsWith('d-'))
  // A line of its own (`d-block`) keeps its own width (`d-table`): an underlined link is not drawn across the column.
  const add = classes(like)
    .filter((c) => SPACING.test(c) && !own.includes(c) && !(shown && c.startsWith('d-')))
    .map((c) => (c === 'd-block' ? 'd-table' : c))
  if (add.length === 0) return attrs
  const merged = [...own, ...add].join(' ')
  return /\sclass\s*=/i.test(attrs)
    ? attrs.replace(/(\sclass\s*=\s*)(["'])[^"']*\2/i, `$1$2${merged}$2`)
    : `${attrs} class="${merged}"`
}

/**
 * The channels a contact block (one that calls or mails the business) does not show, each as a link cloned from the
 * block's own: a number from its phone link, a chat app and a direct message from its other link (else the phone link),
 * with the phone line's spacing. The numbers and chat apps follow the call line (`reach`), every number first; the direct
 * messages follow the block's last line (`messages`). Null when the block is no contact block or shows them all.
 */
function missingLines(/** @type {string} */ html, /** @type {Channel[]} */ reach) {
  const anchors = anchorsOf(html)
  const calls = anchors.filter((a) => /^tel:/i.test(a.href) && a.text !== '')
  const mails = anchors.filter((a) => /^mailto:/i.test(a.href) && a.text !== '')
  if (calls.length === 0 && mails.length === 0) return null
  const hrefs = anchors.map((a) => a.href.toLowerCase())
  const shown = (/** @type {Channel} */ c) => {
    if (c.kind === 'phone')
      return hrefs.includes(c.href.toLowerCase()) || digits(textOf(html)).includes(digits(c.value))
    const app = APP_HREF[/** @type {keyof typeof APP_HREF} */ (c.kind)]
    if (app) return hrefs.some((h) => app.test(h) && digits(h).includes(digits(c.value)))
    return hrefs.includes(c.href.toLowerCase())
  }
  const missing = reach.filter((c) => !shown(c))
  if (missing.length === 0) return null
  const phoneLink = calls[0] ?? mails[0]
  const other = [...anchors].reverse().find((a) => a.text !== '' && !/^tel:/i.test(a.href)) ?? phoneLink
  const linkOf = (/** @type {Channel} */ c) => {
    const attrs = ownAttrs(c.kind === 'phone' ? phoneLink.attrs : spacedLike(other.attrs, phoneLink.attrs))
    const words = c.kind === 'phone' ? c.value : c.label
    return `<a href="${escapeHtml(c.href)}"${attrs}${outside(c.href)}>${escapeHtml(words)}</a>`
  }
  const ordered = [...missing.filter((c) => c.kind === 'phone'), ...missing.filter((c) => isApp(c.kind))]
  const messages = missing.filter((c) => c.kind === 'message')
  return {
    reach: ordered.length ? { after: /** @type {'call'} */ ('call'), links: ordered.map(linkOf) } : null,
    messages: messages.length ? { after: /** @type {'last'} */ ('last'), links: messages.map(linkOf) } : null
  }
}

/**
 * The module writes that point every published module's contact lines at the business (`content.batch` steps).
 * @param {object} input
 * @param {Array<{ id: number | string, published?: number | string, language?: string, content?: unknown }>} input.modules
 * @param {Contact | null | undefined} input.contact - the site plan's contact facts; none = nothing written
 * @param {Set<string>} input.visible - the language tags a visitor can reach
 * @param {Channel[] | null} [input.channels] - the site plan's channels (each phone, WhatsApp, each direct message)
 * @param {any[]} [input.slots] - the content map's slots: no added line moves a node one of them binds to
 * @returns {{ steps: Array<{ kind: 'module', id: number, fields: { content: string } }>, moved: number, removed: number, added: number }}
 */
export function moduleContactSteps({ modules, contact, visible, channels = null, slots = [] }) {
  const steps = []
  let moved = 0
  let removed = 0
  let added = 0
  if (!contact) return { steps, moved, removed, added }
  for (const row of modules) {
    const language = String(row.language ?? '*')
    if (Number(row.published) !== 1 || (language !== '*' && !visible.has(language))) continue
    if (typeof row.content !== 'string' || row.content === '') continue
    const bound = slots
      .filter(
        (s) => s?.entity === `module-${row.id}` && s.column === 'content' && typeof s.xpath === 'string'
      )
      .map((s) => s.xpath)
    const next = joomlaContactLinks(row.content, contact, { channels, bound })
    if (next.html === row.content) continue
    steps.push({ kind: 'module', id: Number(row.id), fields: { content: next.html } })
    moved += next.moved
    removed += next.removed
    added += next.added
  }
  return { steps, moved, removed, added }
}
