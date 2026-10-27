/**
 * The DOM half of the seeder, on the host: the same swap `src/client/fixture.ts` does in the
 * browser (find slot `tag.n` as `body.querySelectorAll(tag)[n]`, rewrite the element's OWN text
 * nodes, keep its children), on linkedom — the DOM this plugin already carries for the slot
 * extraction. Two things the client never needed: an `href` on a link slot (a seeded page's nav
 * must lead somewhere), and slot maps of a section fragment of the theme's library.
 *
 * Pure: strings in, strings out. `test/seed-dom.test.mjs` pins the numbering against the client's.
 */
import { parseHTML } from 'linkedom'

import { slotsOf } from '../../../../../scripts/lib/od-slots-dom.mjs'

/** Roles whose element is one sentence (same set as the client's): the whole text is replaced. */
const WHOLE_TEXT_ROLES = new Set(['paragraph', 'headline', 'title', 'subtitle', 'eyebrow', 'quote'])

/** @param {Element} el @param {string} text */
function setOwnText(el, text) {
  let placed = false
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== 3) continue
    if ((node.textContent ?? '').trim() === '') continue
    if (!placed) {
      const raw = node.textContent ?? ''
      const lead = raw.match(/^\s*/)?.[0] ?? ''
      const tail = raw.match(/\s*$/)?.[0] ?? ''
      node.textContent = `${lead}${text}${tail}`
      placed = true
    } else {
      node.textContent = ''
    }
  }
  if (!placed) el.prepend(el.ownerDocument.createTextNode(text))
}

/**
 * Whole documents keep their shape; a fragment (a section of the library, a theme snippet) is
 * parsed inside a body of its own and handed back as that body's inner HTML.
 * @param {string} html
 */
function parse(html) {
  const whole = /<html[\s>]/i.test(html)
  const { document } = parseHTML(whole ? html : `<!doctype html><html><body>${html}</body></html>`)
  return { document, whole }
}

/** @param {{ document: any, whole: boolean }} p */
function serialize(p) {
  return p.whole ? `<!doctype html>${p.document.documentElement.outerHTML}` : p.document.body.innerHTML
}

/**
 * Put `fills` into `html` — `{ id: 'p.3', text, role? }` — and set `href` where a fill carries one.
 * @param {string} html - a whole document or a fragment
 * @param {{ id: string, text?: string, role?: string, href?: string }[]} fills
 */
export function applyFill(html, fills) {
  if (fills.length === 0) return html
  const p = parse(html)
  const byTag = new Map()
  for (const f of fills) {
    const dot = f.id.lastIndexOf('.')
    const tag = f.id.slice(0, dot)
    const n = Number(f.id.slice(dot + 1))
    let list = byTag.get(tag)
    if (!list) {
      list = Array.from(p.document.body.querySelectorAll(tag))
      byTag.set(tag, list)
    }
    const el = list[n]
    if (!el) continue
    if (typeof f.text === 'string') {
      if (f.role !== undefined && WHOLE_TEXT_ROLES.has(f.role) && el.children.length > 0)
        el.textContent = f.text
      else setOwnText(el, f.text)
    }
    if (typeof f.href === 'string' && (el.tagName.toLowerCase() === 'a' || el.hasAttribute('href'))) {
      el.setAttribute('href', f.href)
    }
  }
  return serialize(p)
}

/**
 * The inspiration's own name, wherever the author wrote it, becomes the site's — every text node
 * and every input value, placeholder and title (the client's `swapBrand`, on linkedom).
 * @param {string} html
 * @param {string} from
 * @param {string} to
 */
export function swapBrand(html, from, to) {
  const a = from.trim()
  const b = to.trim()
  if (a === '' || b === '' || a.toLowerCase() === b.toLowerCase()) return html
  const pattern = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const p = parse(html)
  /** @param {Node} node */
  const walk = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) {
        const text = child.textContent ?? ''
        if (pattern.test(text)) child.textContent = text.replace(pattern, b)
        pattern.lastIndex = 0
      } else if (child.nodeType === 1) {
        const element = /** @type {Element} */ (child)
        const tag = element.tagName.toLowerCase()
        // The credit says which design the page was built on; swapping the name in there would
        // have the site credit itself for its own inspiration.
        const credit = element.hasAttribute('data-tracy-credit')
        if (tag !== 'script' && tag !== 'style' && !credit) walk(child)
      }
    }
  }
  walk(p.document.body)
  for (const el of Array.from(
    p.document.body.querySelectorAll('input[value], input[placeholder], [title]')
  )) {
    for (const attr of ['value', 'placeholder', 'title']) {
      const v = el.getAttribute(attr)
      if (v !== null && pattern.test(v)) el.setAttribute(attr, v.replace(pattern, b))
      pattern.lastIndex = 0
    }
  }
  return serialize(p)
}

/**
 * The slot map of a fragment, numbered the way `applyFill` will look the slots up — so a section
 * of the library gets ids the model can write to, like a fixture does.
 * @param {string} fragment
 */
export function fragmentSlots(fragment) {
  return slotsOf(`<!doctype html><html><body>${fragment}</body></html>`, [])
}

/** Block comments of WordPress markup (`<!-- wp:… -->`, `<!-- /wp:… -->`) taken out: the HTML that is left renders the same. @param {string} html */
export function stripBlocks(html) {
  return html.replace(/<!--\s*\/?wp:[\s\S]*?-->\s*/g, '')
}
