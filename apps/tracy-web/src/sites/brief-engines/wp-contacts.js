/**
 * The links of a WordPress body that mail or call somebody, pointed at the customer's own mailbox and phone.
 *
 * 🔒 A LINK THAT MAILS OR CALLS IS THE BUSINESS'S OWN DOOR, AND THE TEMPLATE'S LEADS TO ANOTHER COMPANY. Measured 05/10/2026
 * (ledger L17) on a one-language JA WordPress template made with Apply: the footer's e-mail tile and the Contact page still
 * mailed the demo company (`mailto:…`), while the email and phone the customer typed stood on no page — that template's
 * contract has no contact slot, and the sweep cut sections, never links. So every `mailto:` and `tel:` link a visitor can
 * follow (an `href` of the markup, a block's own `url`) that is not the customer's leads to what the customer typed, and
 * where the link SHOWED the demo's address or number, it shows the customer's, as they typed it. A phone link carries the
 * digits and a leading `+` only (`tel:+842345550199`), the shape every dialler and the plugin's own link check take; a
 * demo's `?subject=…` goes with the demo's address, since it is the demo's words.
 *
 * 🔒 WITH NOTHING TYPED, THE DEMO'S LINK STAYS (11/10/2026, BLANK and FULL alike): a customer who gave no phone or no
 * mailbox keeps the template's contact lines and their `tel:`/`mailto:` links as placeholders, the way the rest of the demo
 * stays; nothing is invented and nothing is cut. Each kind on its own: a typed phone moves the phone links, and the mail
 * links keep the demo's mailbox. The account that receives the forms' mail when nothing was typed (`wp-residue.js` `to`,
 * the owner's decision of 05/10/2026) is never put on a page.
 *
 * Not touched: a form's hidden configuration (an input's value, Contact Form 7's `_mail`), which is no link a visitor
 * follows, and a link already leading to the customer's own mailbox or number.
 */

import { commentJson, memberAt, parseBlocks } from './wp-blocks.js'
import { factsOf, ungrounded } from './guard.js'

/** A phone number as a page shows one: `+84 234 555 0199`, `(202) 555-0160`, `(+84) 234-555-0199`. */
const PHONE = /\(?\+?\d[\d\s().-]{4,}\d/g
/** An email address. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
/** A run a contact link shows is a number from this many digits on: "24/7" or "Call 3 times" is not one. */
const NUMBER_DIGITS = 6
/** An extension after a phone number: `ext. 12`, `x12`, `#12`. */
const EXTENSION = /\s*(?:(?:\bext(?:ension)?|\bx)\.?|#)\s*\d.*$/i
/** An `<a>` element, its attributes and what it shows (an `<a>` holds no other `<a>`). */
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi
/** The `href` among an element's attributes, quoted either way. */
const HREF = /(\shref\s*=\s*)(["'])([\s\S]*?)\2/i

const digits = (/** @type {string} */ s) => s.replace(/\D+/g, '')
const escapeText = (/** @type {string} */ s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The phone number a customer typed, as a link can take it: the first number of what they wrote, without an extension
 * ("+84 234 555 0199 ext. 12", "0234 555 0199 / 0905 555 012").
 * @param {unknown} raw
 */
const typedPhone = (raw) =>
  String(raw ?? '')
    .replace(EXTENSION, '')
    .match(new RegExp(PHONE.source))?.[0]
    .trim() ?? ''
/** The mailbox a customer typed: the first address of what they wrote ("a@x.example, b@x.example"). @param {unknown} raw */
const typedMail = (raw) => String(raw ?? '').match(new RegExp(EMAIL.source))?.[0] ?? ''
/** A link's own text, decoded the way a browser hands it on (`tel:+1%20202…`), or as it stands when it is no URI text. */
const decoded = (/** @type {string} */ s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/**
 * The body with every link that mails or calls the template's company leading to the customer's own mailbox and phone;
 * a link of a kind the customer typed nothing for stays as it is.
 * @param {string} markup
 * @param {{ email?: string | null, phone?: string | null }} given - what the customer typed; empty is "nothing typed"
 * @returns {{ markup: string, moved: number, dropped: number, left: number, missed: number }} `moved` links now lead to the
 *   customer; `dropped` is always 0 (no link goes since 11/10/2026); `left` and `missed` count a block's own link the
 *   comment did not let be found, which still leads to the template's company though something was typed
 */
export function contactLinks(markup, given) {
  const root = parseBlocks(markup)
  if (!root) return { markup, moved: 0, dropped: 0, left: 0 }
  const mail = typedMail(given?.email)
  const tel = typedPhone(given?.phone)
  const telDigits = digits(tel)
  const own = {
    mail: mail === '' ? null : { href: `mailto:${mail}`, shown: mail },
    tel:
      telDigits.length < 5 ? null : { href: `tel:${/^\(?\+/.test(tel) ? '+' : ''}${telDigits}`, shown: tel }
  }
  /**
   * What a link leads to, when it mails or calls somebody who is not the customer.
   * @param {string} raw - as the markup spells it
   * @returns {{ kind: 'mail' | 'tel', demo: string } | null}
   */
  const demoOf = (raw) => {
    const href = raw.replace(/&amp;/g, '&').trim()
    const mailto = /^mailto:([^?#]*)/i.exec(href)
    if (mailto) {
      const address = decoded(mailto[1]).trim()
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return null
      return mail !== '' && address.toLowerCase() === mail.toLowerCase()
        ? null
        : { kind: 'mail', demo: address }
    }
    const call = /^tel:(.*)$/i.exec(href)
    if (!call) return null
    const number = digits(decoded(call[1]))
    if (number.length < 5) return null
    return number === telDigits ? null : { kind: 'tel', demo: number }
  }
  /**
   * What a link shows, with every address (a mail link) or number (a phone link) it showed said as the customer typed
   * theirs: a link that mails or calls shows where it leads, whatever spelling the demo gave that ("(202) 555-0160" under
   * `tel:+1-202-555-0160`, a second mailbox beside the first). Tags and their attributes stay as they were.
   * @param {string} inner
   * @param {{ kind: 'mail' | 'tel', demo: string }} link
   */
  const showOwn = (inner, link) => {
    const mine = own[link.kind]
    if (!mine) return inner
    const shown = escapeText(mine.shown)
    return inner.replace(/(<[^>]*>)|([^<]+)/g, (whole, tag, text) => {
      if (tag) return tag
      if (link.kind === 'mail') return text.replace(EMAIL, shown)
      return text.replace(PHONE, (/** @type {string} */ found) =>
        digits(found).length >= NUMBER_DIGITS ? shown : found
      )
    })
  }
  /** @type {Array<{ start: number, end: number, text: string }>} */
  const edits = []
  for (const found of markup.matchAll(ANCHOR)) {
    const [whole, attrs, inner] = found
    const href = HREF.exec(attrs)
    const link = href ? demoOf(href[3]) : null
    // Nothing typed of this kind: the demo's link stays as the template has it.
    const mine = link ? own[link.kind] : null
    if (!href || !link || !mine) continue
    const at = found.index ?? 0
    const attribute = mine.href.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    const next = `<a${attrs.replace(HREF, (_, lead, quote) => `${lead}${quote}${attribute}${quote}`)}>${showOwn(inner, link)}</a>`
    edits.push({ start: at, end: at + whole.length, text: next })
  }
  let missed = 0
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    const url = node.attrs?.url
    const link = typeof url === 'string' ? demoOf(url) : null
    const mine = link ? own[link.kind] : null
    if (mine) {
      // Found by what the comment says, however it spells it; one that cannot be found is counted, never passed over.
      const member = memberAt(markup, node, 'url', String(url))
      if (member) edits.push({ ...member, text: `"url":${commentJson(mine.href)}` })
      else missed += 1
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)

  if (edits.length === 0) return { markup, moved: 0, dropped: 0, left: missed, missed }
  // Last first, so every place found above is still where it was.
  let out = markup
  for (const edit of [...edits].sort((x, y) => y.start - x.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  // What is written back must still be blocks all the way down.
  if (!parseBlocks(out))
    return { markup, moved: 0, dropped: 0, left: missed + edits.length, missed: missed + edits.length }
  return { markup: out, moved: edits.length, dropped: 0, left: missed, missed }
}

/** A plain JSON object, as PHP's associative array arrives (an empty one arrives as `[]`, which is none). */
const isRecord = (/** @type {unknown} */ v) => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * The site's identity option (`tracy_site_identity`, where the Tracy WordPress themes read a site's public contact details
 * from) with its public mailbox set to `email`, in the shape it was stored in: nested groups (`contact: { email }`) or flat
 * dotted keys (`contact.email`). A nested `contact.email` wins where both are there, as the themes read it. Null when nothing
 * would change, which includes no option and no mailbox to give it.
 *
 * @param {unknown} identity - the option as read, `undefined` when the site never stored it
 * @param {string} email - the mailbox the customer typed, or '' to show none
 * @returns {Record<string, unknown> | null}
 */
export function identityWithEmail(identity, email) {
  const stored = isRecord(identity) ? /** @type {Record<string, any>} */ (identity) : {}
  const group = isRecord(stored.contact) ? stored.contact : null
  const nested = (group !== null && 'email' in group) || !Object.keys(stored).some((key) => key.includes('.'))
  const current = nested ? group?.email : stored['contact.email']
  if ((typeof current === 'string' ? current : '') === email) return null
  return nested ? { ...stored, contact: { ...group, email } } : { ...stored, 'contact.email': email }
}

/** A contact detail's kind, by the end of a slot's key or input (`identity.contact.tel`, `contact.email`). */
const KIND_OF_KEY = /** @type {Array<[RegExp, 'email' | 'phone' | 'address' | 'hours']>} */ ([
  [/(?:^|\.)(?:e-?mail|mail)$/i, 'email'],
  [/(?:^|\.)(?:phone|tel|hotline)$/i, 'phone'],
  [/(?:^|\.)address$/i, 'address'],
  [/(?:^|\.)hours$/i, 'hours']
])
/** A contact detail's kind, by what a guard says of a line that states one. */
const KIND_OF_REASON = /** @type {Array<[RegExp, 'email' | 'phone' | 'address']>} */ ([
  [/^email address not given/, 'email'],
  [/^phone number not given/, 'phone'],
  [/^street address not given/, 'address']
])

/**
 * The text slots that hold a demo contact line of a kind the customer typed nothing for: they keep the template's words.
 *
 * 🔒 NOTHING TYPED KEEPS THE DEMO'S CONTACT LINES (11/10/2026, BLANK and FULL alike): no phone, mailbox, address or
 * opening hours given leaves the demo's lines as placeholders; nothing is invented from the business name, and the line is
 * neither rewritten into one with no detail in it nor taken off for lacking honest words. A kind is read from the slot's key or
 * input (`identity.contact.hours`), else from its sample: a phone number, a mailbox or a street address stated in it.
 * @param {Array<{ key: string, type?: string, input?: string, sample?: unknown }>} slots
 * @param {{ email?: unknown, phone?: unknown, address?: unknown, hours?: unknown }} given - what the customer typed
 * @returns {Set<string>}
 */
export function heldContactSlots(slots, given) {
  const typed = (/** @type {unknown} */ v) => typeof v === 'string' && v.trim() !== ''
  const none = factsOf('')
  /** @type {Set<string>} */
  const held = new Set()
  for (const slot of slots) {
    if (slot.type !== 'text' || typeof slot.sample !== 'string') continue
    const named = [String(slot.input ?? ''), String(slot.key)]
      .flatMap((name) => KIND_OF_KEY.filter(([re]) => re.test(name)).map(([, kind]) => kind))
      .at(0)
    const reason = named ? null : ungrounded(slot.sample, slot.sample, none)
    const kind = named ?? KIND_OF_REASON.find(([re]) => reason && re.test(reason))?.[1]
    if (kind && !typed(given?.[kind])) held.add(slot.key)
  }
  return held
}
