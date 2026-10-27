/**
 * The buttons of a WordPress page or part, told apart by where they lead, so each is said again in the right way.
 *
 * 🔒 A BUTTON'S LABEL NAMES WHERE IT LEADS (TCH #1013, measured 10/10/2026 on dev g59-ess-wp-full, JA Essence WordPress 1.0.12,
 * a bakery, Vietnamese): the footer's "Become a subscriber" → /contact came back as "Xem thực đơn" (View the menu), and the
 * gallery's "@Grazia on instagram" → `#` as "Xem hình ảnh bánh" (See the cake pictures). Both planners were given the label and
 * nothing else, so they wrote a promise the link does not keep. So:
 * - a button into a page of the site (`page`) is planned with that page's name, and an answer that names nothing of it gives
 *   way to the page's own name (`holdTargets`);
 * - a social button (`social`: its label, its class or its address names a network, or the label is an `@handle`) is the
 *   template's, kept as the demo has it with only its link emptied (K6, product owner 10/10/2026): translated, never rewritten;
 * - a button that leads nowhere (`void`: `#`, empty, `javascript:`) keeps the demo's label, translated: an action label on it
 *   would promise what no link does;
 * - a button to a document of the demo company (`file`: a PDF profile, a brochure) leads to the Contact page and says so
 *   (DEMO FILE LINKS, product owner 10/10/2026), in every template (`fileLinksToContact`);
 * - on a site written for the customer (FULL), a button that leads nowhere and says something (not decor) leads to the Contact
 *   page under the template's contact label too (PAGE-5, decision of 11/10/2026; the seeder does it for the content slots, this
 *   for the buttons no slot holds: a header's, a footer's). BLANK keeps it as the demo has it, translated.
 */
import { parseBlocks, plain, withText } from './wp-blocks.js'

/** A social network, by the words its label, class or address carries. */
const SOCIAL =
  /\b(?:instagram|facebook|fb|twitter|x\.com|tiktok|youtube|youtu\.be|linkedin|pinterest|threads|whatsapp|telegram|zalo|dribbble|behance|vimeo|snapchat|tumblr|reddit|discord|wechat|weibo|line\.me|messenger|social)\b/i
/** A document a button hands out: the demo company's profile, brochure, price list. */
const FILE = /\.(?:pdf|docx?|pptx?|xlsx?|odt|ods|odp|rtf|zip|rar|7z)$/i

/**
 * The address and the classes of a button block: its first anchor's `href` (null when it has no anchor or no `href`) and the
 * block's own and the anchor's classes.
 * @param {string} markup
 * @param {import('./wp-blocks.js').Block} node
 * @returns {{ href: string | null, className: string }}
 */
export function buttonLink(markup, node) {
  const inner = markup.slice(node.innerStart, node.innerEnd)
  const anchor = /<a\b([^>]*)>/i.exec(inner)
  const attr = (/** @type {string} */ name) =>
    anchor ? (new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, 'i').exec(anchor[1])?.[1] ?? null) : null
  const href = attr('href')
  return {
    href: href === null ? null : href.replace(/&amp;/g, '&').trim(),
    className: [node.attrs?.className ?? '', attr('class') ?? ''].join(' ').trim()
  }
}

/**
 * What kind of button a label and its link make (see the module comment).
 * @param {{ text: string, href: string | null, className?: string }} button
 * @returns {'social' | 'void' | 'file' | 'page'}
 */
export function buttonKind({ text, href, className = '' }) {
  const host = (() => {
    try {
      return href && /^[a-z][a-z0-9+.-]*:\/\//i.test(href) ? new URL(href).hostname : ''
    } catch {
      return ''
    }
  })()
  if (/^\s*@\w/.test(text) || SOCIAL.test(text) || SOCIAL.test(className) || SOCIAL.test(host))
    return 'social'
  if (href === null || href === '' || href === '#' || /^javascript:/i.test(href)) return 'void'
  const path = href.split(/[?#]/)[0]
  if (FILE.test(path)) return 'file'
  return 'page'
}

/** A path of a site's address, the root as `/`, '' when it is no address. */
const pathOf = (/** @type {string} */ url) => {
  try {
    return new URL(url, 'http://site.invalid').pathname.replace(/\/+$/, '') || '/'
  } catch {
    return ''
  }
}

/**
 * The page of the site a link leads to, by its path: the page's address when the listing gives one, else its slug (the home
 * page at the root).
 * @template {{ slug: string, title?: string, url?: string }} P
 * @param {string | null} href
 * @param {P[]} pages
 * @returns {P | null}
 */
export function pageAt(href, pages) {
  if (!href || /^(?:mailto|tel|javascript):/i.test(href) || href.startsWith('#')) return null
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href)) {
    const own = pages.find((p) => p.url)?.url
    try {
      if (!own || new URL(href).origin !== new URL(own).origin) return null
    } catch {
      return null
    }
  }
  const at = pathOf(href)
  if (at === '') return null
  return (
    pages.find((p) => (p.url ? pathOf(p.url) === at : false)) ??
    pages.find((p) => `/${p.slug}` === at || (at === '/' && /^(?:home|front-page)$/.test(p.slug))) ??
    null
  )
}

/**
 * What a planner is told a button opens: the page's title, another site, a place on the page, or nothing.
 * @param {string | null} href
 * @param {Array<{ slug: string, title?: string, url?: string }>} pages
 */
export function targetName(href, pages) {
  const page = pageAt(href, pages)
  if (page) return `the "${plain(String(page.title ?? page.slug))}" page`
  if (href && /^[a-z][a-z0-9+.-]*:\/\//i.test(href)) return 'a page of another site'
  if (href && /^mailto:/i.test(href)) return 'an email to the business'
  if (href && /^tel:/i.test(href)) return 'a call to the business'
  if (href && href.startsWith('#') && href.length > 1) return 'a place further down the same page'
  return 'no page'
}

/** The words of a label, one case, no punctuation: what two labels are compared by. */
const wordsOf = (/** @type {unknown} */ text) =>
  new Set(
    plain(String(text ?? ''))
      .normalize('NFC')
      .toLocaleLowerCase()
      .split(/[\s\p{P}\p{S}]+/u)
      .filter((w) => w.length >= 2)
  )

/** Whether a label says a word of a page's name: "Liên hệ ngay" names "Liên hệ"; "Xem thực đơn" does not. */
export function sharesWord(/** @type {unknown} */ label, /** @type {unknown} */ name) {
  const a = wordsOf(label)
  return [...wordsOf(name)].some((w) => a.has(w))
}

/**
 * The relabelled buttons whose new label names nothing of the page they open, given that page's own name instead: its name in
 * the site's language when the judge gave one (`relabel` of its title), its title when the site is in the template's language.
 * A button whose page has no name in the site's language keeps the judge's label, and is counted in `unsure`.
 * @param {Map<string, string>} relabel - old label → new label, the judge's (changed in place)
 * @param {Array<{ text: string, target: string | null }>} buttons - each button label and the title of the page it opens
 * @param {{ language: boolean }} options - whether the site is written in a language other than the template's
 * @returns {{ held: string[], unsure: string[] }}
 */
export function holdTargets(relabel, buttons, { language }) {
  /** @type {string[]} */
  const held = []
  /** @type {string[]} */
  const unsure = []
  for (const { text, target } of buttons) {
    const next = relabel.get(text)
    if (!target || next === undefined) continue
    const name = relabel.get(target) ?? (language ? null : target)
    if (sharesWord(next, target) || (name && sharesWord(next, name))) continue
    if (!name) {
      unsure.push(text)
      continue
    }
    relabel.set(text, name)
    held.push(text)
  }
  return { held, unsure }
}

/**
 * The buttons of a body (`core/button` leaves): each block, its one-line words, its address and its kind (`buttonKind`).
 * @param {string} markup
 * @returns {Array<{ node: import('./wp-blocks.js').Block, text: string, href: string | null, kind: 'social' | 'void' | 'file' | 'page' }>}
 */
export function buttonsIn(markup) {
  const root = parseBlocks(markup)
  if (!root) return []
  /** @type {Array<{ node: import('./wp-blocks.js').Block, text: string, href: string | null, kind: 'social' | 'void' | 'file' | 'page' }>} */
  const out = []
  const walk = (/** @type {import('./wp-blocks.js').Block} */ node) => {
    if (node.name === 'core/button' && node.children.length === 0) {
      const link = buttonLink(markup, node)
      const text = plain(markup.slice(node.innerStart, node.innerEnd).replace(/<[^>]*>/g, ' '))
      out.push({ node, text, href: link.href, kind: buttonKind({ text, ...link }) })
    }
    for (const child of node.children) walk(child)
  }
  for (const top of root.children) walk(top)
  return out
}

/** Whether a label says something of its own: two letters in a row, an arrow or an icon glyph is decor. */
export const worded = (/** @type {string} */ text) => /\p{L}{2,}/u.test(text)

/**
 * The body with every button to a document of the demo company (`file`) leading to the Contact page under `label`, and with
 * `voids` (FULL) every worded button that leads nowhere too: the anchor's address and the button's one line change, nothing
 * else (an anchor with no address is given one). A button whose label is not one line is left, and counted.
 * @param {string} markup
 * @param {{ url: string, label: string, voids?: boolean }} to
 * @returns {{ markup: string, moved: number, left: number }}
 */
export function fileLinksToContact(markup, to) {
  const found = buttonsIn(markup)
    .filter((b) => b.kind === 'file' || (to.voids === true && b.kind === 'void' && worded(b.text)))
    .map((b) => b.node)
  let out = markup
  let moved = 0
  let left = 0
  const href = to.url.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  // Last first, so the buttons still to do keep the places they were found at.
  for (const node of found.sort((a, b) => b.start - a.start)) {
    const labelled = withText(out, node, to.label)
    if (labelled === null) {
      left += 1
      continue
    }
    const end = node.end + (labelled.length - out.length)
    const block = labelled.slice(node.start, end)
    const pointed = /<a\b[^>]*?\shref\s*=\s*"/i.test(block)
      ? block.replace(/(<a\b[^>]*?\shref\s*=\s*")[^"]*(")/i, `$1${href}$2`)
      : block.replace(/<a\b/i, `<a href="${href}"`)
    const next = `${labelled.slice(0, node.start)}${pointed}${labelled.slice(end)}`
    if (!parseBlocks(next)) {
      left += 1
      continue
    }
    out = next
    moved += 1
  }
  return { markup: out, moved, left }
}
