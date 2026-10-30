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
import { sameBoundNode } from './joomla-bound-nodes.js'
import { boundNodes, lineOf, placeLines } from './joomla-contact-lines.js'
import { channelButtonLabel } from 'website-opportunities/domain/declared-button-plan.mjs'
import { contactEntriesOf } from 'website-opportunities/domain/footer-contact-shape.mjs'

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

/**
 * 🔒 A BUTTON THAT NOW CALLS, MAILS OR MESSAGES SAYS SO (COO criterion 1.8, group B handoff): a link whose words are a
 * button label (no number or mailbox shown) repointed to `tel:`, `mailto:` or WhatsApp takes the channel's own words
 * (`channelButtonLabel`: "Call us", "Email us", "Message us on WhatsApp"), never "How to reach us" over a phone. Its tags
 * (an icon) stay; the first run of words takes the label and the other runs empty, so every bound node keeps its place.
 * Null when the link shows a number or a mailbox, or no words (an icon).
 */
function channelWords(/** @type {string} */ inner, /** @type {string} */ href) {
  const words = inner
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words || new RegExp(EMAIL.source).test(words)) return null
  if ((words.match(PHONE) ?? []).some((n) => digits(n).length >= NUMBER_DIGITS)) return null
  const label = channelButtonLabel(href)
  if (label === 'Contact us') return null
  let placed = false
  return inner.replace(/(<[^>]*>)|([^<]+)/g, (_whole, tag, text) => {
    if (tag) return tag
    if (!text.trim()) return text
    if (placed) return ''
    placed = true
    return text.replace(/\S[\s\S]*\S|\S/, escapeHtml(label))
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

/** Words a page shows no visitor: the screen-reader label beside an icon. */
const HIDDEN_WORDS =
  /<(\w+)\b[^>]*\bclass\s*=\s*(["'])[^"']*\b(?:d-none|sr-only|visually-hidden|screen-reader-text)\b[^"']*\2[^>]*>[\s\S]*?<\/\1\s*>/gi
/** A link that shows an icon and no words: one item of an icon row. */
const isIconOnly = (/** @type {string} */ inner) =>
  textOf(inner.replace(HIDDEN_WORDS, ' ')) === '' && /<(?:i|span|svg|img)\b/i.test(inner)
/** The mark of a line taken off, until the lines it leaves empty go with it. */
const GONE = '\u0001'
const EMPTIED = new RegExp(
  `<(div|p|li|span|ul|ol)\\b[^>]*>(?:\\s|<br\\s*/?>|${GONE})*${GONE}(?:\\s|<br\\s*/?>|${GONE})*</\\1\\s*>`,
  'gi'
)

/** The block without the lines taken off: an element left with nothing but taken-off lines goes too, never a hole. */
function withoutGone(/** @type {string} */ html) {
  let out = html
  for (let before = ''; before !== out; ) {
    before = out
    out = out.replace(EMPTIED, GONE)
  }
  return out.replace(new RegExp(`\\s*${GONE}`, 'g'), '')
}

/** Whether every bound path that found one node before still finds one node of the same shape (`sameBoundNode`). */
function keepsPaths(
  /** @type {string} */ before,
  /** @type {string} */ after,
  /** @type {string[]} */ bound
) {
  for (const xpath of bound) {
    const was = boundNodes(before, xpath)
    if (!was || was.length !== 1) continue
    const now = boundNodes(after, xpath)
    if (!now || now.length !== 1 || !sameBoundNode(was[0], now[0])) return false
  }
  return true
}

/**
 * One module's HTML with its contact links leading to the business (COO rule 29/10/2026), without moving a bound node
 * (`joomla-contact-lines.js`).
 *
 * 🔒 ONE ICON PER CHANNEL KIND; A SUMMARY BLOCK KEEPS THE DEMO'S LINES KIND BY KIND (COO decisions 30/10/2026). Measured
 * on a brief build of a Joomla T4 template: the footer's icon row showed two identical phone icons for the brief's two
 * numbers, and the footer's "get in touch" block, one phone, one address and one mailbox in the demo, listed both numbers,
 * WhatsApp, the areas served and a direct message. So:
 * - links that show an icon and no words (an icon row) keep one link per kind; a call icon calls the main number;
 * - a summary block (`summary`: a footer or header, `summaryModuleIds`) keeps the template's footer shape: each contact
 *   line keeps its kind and shows the business's own of that kind (the k-th call line the k-th number, main first; the
 *   mailbox line the mailbox; a chat line its app), no more lines of a kind than the demo shows (`caps`, the demo's entries
 *   from the content map, `footer-contact-shape.mjs`; one of each kind without them), and a line of a kind the business
 *   lacks goes whole, as do the lines of the areas served beside the street address. No line is ever added there: every
 *   other channel is the Contact page's. A line a contract slot binds is hidden in place instead, so its path keeps its node;
 * - any other block (the contact page's own) shows every channel of the brief, each number its own line, added beside its
 *   phone line.
 * @param {string} html
 * @param {Contact} contact - the site plan's contact facts
 * @param {{ channels?: Channel[] | null, bound?: string[], summary?: boolean, caps?: Record<string, number> | null }} [options]
 *   - the plan's channels, the content map's paths into this HTML, whether the block is a summary block, and the demo's
 *   lines of each kind (`contactEntriesOf`)
 * @returns {{ html: string, moved: number, removed: number, added: number }}
 */
export function joomlaContactLinks(
  html,
  contact,
  { channels = null, bound = [], summary = false, caps = null } = {}
) {
  const facts = contact ?? {}
  const reach = channels ?? channelsOfContact(facts)
  const phones = reach.filter((c) => c.kind === 'phone')
  // A plan whose channels list no number still has its contact phone.
  if (phones.length === 0 && facts.phone?.href)
    phones.push({
      kind: 'phone',
      value: facts.phone.value,
      href: facts.phone.href,
      label: `Call ${facts.phone.value}`
    })
  // The main number first: the plan's contact phone.
  const main = String(facts.phone?.href ?? '').toLowerCase()
  const at = main ? phones.findIndex((p) => p.href.toLowerCase() === main) : -1
  if (at > 0) phones.unshift(...phones.splice(at, 1))
  const appOf = (/** @type {string} */ kind) =>
    reach.find((c) => c.kind === kind) ?? (kind === 'whatsapp' ? (facts.whatsapp ?? null) : null)
  /** @type {Map<string, Channel>} */
  const byLabel = new Map(reach.filter((c) => c.kind !== 'phone').map((c) => [c.label.toLowerCase(), c]))
  // The most call and mailbox lines a summary block keeps: the demo's, else one of each.
  const declaredCaps = caps && Object.keys(caps).length > 0 ? caps : null
  const capOf = (/** @type {string} */ kind) =>
    declaredCaps && (kind === 'phone' || kind === 'email') ? (declaredCaps[kind] ?? 0) : 1
  const source = String(html ?? '')
  // The business's own numbers the block already shows: a demo number takes one it does not show yet.
  const ownOf = (/** @type {string} */ text) =>
    phones.find((p) => (text.match(PHONE) ?? []).some((n) => digits(n) === digits(p.value))) ?? null

  /** The block's links rewritten; a line a summary block drops is taken off, or hidden in place when its ordinal is in `hide`. */
  const rewrite = (/** @type {Set<number>} */ hide) => {
    let moved = 0
    let removed = 0
    let dropped = 0
    const used = new Set()
    for (const m of source.matchAll(ANCHOR)) {
      const own = ownOf(textOf(m[2]))
      if (own) used.add(own.href)
    }
    const iconKinds = new Set()
    /** @type {Map<string, number>} */
    const shownOfKind = new Map()
    const drop = (/** @type {string} */ attrs, /** @type {string} */ words) => {
      const ordinal = dropped
      dropped += 1
      removed += 1
      return hide.has(ordinal)
        ? `<a href="#"${ownAttrs(attrs)} hidden aria-hidden="true" style="display:none !important">${escapeHtml(words)}</a>`
        : GONE
    }
    const html = source.replace(ANCHOR, (whole, attrs, inner) => {
      const href = HREF.exec(attrs)?.[3] ?? ''
      const kind = kindOf(href, inner)
      const icon = isIconOnly(inner)
      // An icon row: one link per kind; a second call, mail or chat icon goes.
      if (icon && kind) {
        if (iconKinds.has(kind)) {
          removed += 1
          return GONE
        }
        iconKinds.add(kind)
      }
      const target = href.replace(/&amp;/g, '&').trim().toLowerCase()
      const channel = kind
        ? null
        : (byLabel.get(textOf(inner).toLowerCase()) ??
          reach.find((c) => c.kind === 'message' && c.href.toLowerCase() === target) ??
          null)
      // A summary block: each contact line keeps its kind and shows the business's own of that kind, up to the demo's count.
      if (summary && !icon && (kind || channel)) {
        const lineKind = kind ?? /** @type {Channel} */ (channel).kind
        const n = shownOfKind.get(lineKind) ?? 0
        shownOfKind.set(lineKind, n + 1)
        const fact =
          n >= capOf(lineKind)
            ? null
            : lineKind === 'phone'
              ? (phones[n] ?? null)
              : lineKind === 'email'
                ? n === 0 && facts.email?.value
                  ? { value: facts.email.value, href: facts.email.href ?? `mailto:${facts.email.value}` }
                  : null
                : kind && isApp(kind)
                  ? n === 0
                    ? appOf(kind)
                    : null
                  : n === 0
                    ? channel
                    : null
        if (!fact?.href) {
          const words =
            kind === 'phone'
              ? (ownOf(textOf(inner)) ?? phones[0])?.value
              : kind === 'email'
                ? facts.email?.value
                : kind && isApp(kind)
                  ? (appOf(kind)?.label ?? textOf(inner))
                  : channel?.label
          return drop(attrs, words ?? textOf(inner))
        }
        if (isOwn(href, fact) && (kind !== 'phone' || ownOf(textOf(inner)))) return whole
        moved += 1
        const shows =
          channelWords(inner, String(fact.href)) ??
          (kind === 'phone' || kind === 'email' ? showOwn(inner, kind, String(fact.value ?? '')) : inner)
        return `<a${pointed(attrs, String(fact.href))}>${shows}</a>`
      }
      if (!kind) {
        // A line the plan wrote with a channel's words ("Message us on Instagram") leads to that channel.
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
        const own = icon ? null : ownOf(textOf(inner))
        // A call icon calls the main number; a call line takes a number the block does not show yet.
        const phone = icon ? phones[0] : (own ?? phones.find((p) => !used.has(p.href)) ?? phones[0])
        if (!phone) {
          removed += 1
          return ''
        }
        used.add(phone.href)
        if (isOwn(href, phone) && (own || icon)) return whole
        moved += 1
        const shows = own ? inner : (channelWords(inner, phone.href) ?? showOwn(inner, 'phone', phone.value))
        return `<a${pointed(attrs, phone.href)}>${shows}</a>`
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
      // A chat link keeps its own words ("WhatsApp"); a mail button takes "Email us".
      const shows = isApp(kind)
        ? inner
        : (channelWords(inner, String(fact.href ?? '')) ?? showOwn(inner, kind, fact.value))
      return `<a${next}>${shows}</a>`
    })
    return { html, moved, removed, dropped }
  }

  // Each dropped line goes whole, unless taking it off leaves a bound path without its node: that one is hidden in place.
  const keeps = (/** @type {Set<number>} */ hide) =>
    keepsPaths(source, withoutGone(rewrite(hide).html), bound)
  let made = rewrite(new Set())
  if (made.dropped > 0 && !keeps(new Set())) {
    const all = [...Array(made.dropped).keys()]
    const hide = new Set(all.filter((i) => !keeps(new Set(all.filter((j) => j !== i)))))
    made = rewrite(keeps(hide) ? hide : new Set(all))
  }
  let { moved, removed } = made
  let added = 0
  let out = withoutGone(made.html)
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
  if (summary) {
    // One location line: the street address. A line of the areas served beside it goes whole (never when it is the only one).
    const areas = String(facts.serviceArea?.value ?? '')
      .split(/\s*;\s*/)
      .filter(Boolean)
    if (facts.address?.value && areas.length > 0) {
      const flat = (/** @type {string} */ t) => t.replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
      const lines = /<(p|div|li|span)\b[^>]*>([^<]*)<\/\1\s*>/gi
      const marked = out.replace(lines, (whole, _tag, words) => (areas.includes(flat(words)) ? GONE : whole))
      const next = withoutGone(marked)
      if (next !== out && keepsPaths(out, next, bound)) {
        removed += 1
        out = next
      }
    }
    return { html: out, moved, removed, added }
  }
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
 * @param {Set<number>} [input.summaries] - the modules that are summary blocks (`summaryModuleIds`): the demo's lines kind by kind
 * @param {any} [input.contentMap] - the release's content map: each summary block's demo entries (`contactEntriesOf`)
 * @returns {{ steps: Array<{ kind: 'module', id: number, fields: { content: string } }>, moved: number, removed: number, added: number }}
 */
export function moduleContactSteps({
  modules,
  contact,
  visible,
  channels = null,
  slots = [],
  summaries = new Set(),
  contentMap = null
}) {
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
    const next = joomlaContactLinks(row.content, contact, {
      channels,
      bound,
      summary: summaries.has(Number(row.id)),
      caps: contentMap ? contactEntriesOf(contentMap, `module-${row.id}`) : null
    })
    if (next.html === row.content) continue
    steps.push({ kind: 'module', id: Number(row.id), fields: { content: next.html } })
    moved += next.moved
    removed += next.removed
    added += next.added
  }
  return { steps, moved, removed, added }
}
