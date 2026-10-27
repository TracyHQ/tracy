/**
 * The pure half of `build-od-slots.mjs`: given what a fixture element IS (tag, classes, own text,
 * ancestors, component group), say whether it is a slot and what role it plays. No DOM here, so
 * `scripts/test/od-slots.test.mjs` pins every rule without linkedom.
 *
 * A SLOT is an element whose OWN text nodes carry words — not its descendants'. Airbnb's tab button
 * is `<button><span class="tab-glyph"><svg/></span> Homes <span class="tab-new">New</span></button>`:
 * the slot is the button with text "Homes"; the "New" pill is its own slot; the svg is nobody's.
 * Filling a slot rewrites its own text nodes only, so glyphs and pills survive.
 *
 * Roles, in the words the customer-facing copy pipeline uses (spec §4f):
 *   brand · headline · title · subtitle · eyebrow · paragraph · label · number · button · nav · link · quote
 *
 * Eyebrows are mostly SHOUTED BY CSS (`text-transform: uppercase`), not by the text, so the text test
 * alone found 24 in 152 fixtures. The DOM side therefore also reports `beforeHeading` — the element
 * is the previous sibling of an h1/h2 — and a short line there is an eyebrow whatever its case.
 */

/** Tags whose own text can be a slot. Everything else (div, section, svg, li wrappers) is structure. */
export const SLOT_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'button',
  'a',
  'label',
  'span',
  'strong',
  'em',
  'small',
  'li',
  'td',
  'th',
  'dt',
  'dd',
  'figcaption',
  'blockquote',
  'summary',
  'legend',
  'option'
])

/** Subtrees that never hold copy: scripts, styles, vector art, and what the author hid from readers. */
export const SKIP_TAGS = new Set(['script', 'style', 'svg', 'template', 'noscript', 'head', 'title'])

/**
 * `98%` · `3.2s` · `$29` · `24` · `1,204` · `+12%` — a figure, with at most a short unit.
 * @param {string} text
 */
export function isNumberish(text) {
  const t = text.trim()
  return /\d/.test(t) && /^[~<>≤≥+\-–—]?\s?[$€£¥]?[\d.,]+(\s?[a-zA-Z%×x/]{1,5})?$/.test(t)
}

/**
 * `AI WORKSTATION FOR WEBSITE OPERATIONS` — short and shouted: an eyebrow or a section kicker.
 * @param {string} text
 */
export function isEyebrow(text) {
  const t = text.trim()
  if (t.length < 3 || t.length > 60) return false
  const letters = t.replace(/[^A-Za-zÀ-ỹ]/g, '')
  if (letters.length < 3) return false
  const upper = letters.replace(/[^A-ZÀ-Ỹ]/g, '').length
  return upper / letters.length >= 0.8
}

/** @param {string} text */
export function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * The role of one slot.
 * @param {{ tag: string, classes: string[], text: string, ancestors: string[], role?: string|null, beforeHeading?: boolean }} el
 *   `ancestors` are the tag names from parent up to body; `role` is the element's ARIA role;
 *   `beforeHeading` says the next element sibling is an h1 or h2.
 * @returns {string}
 */
export function roleOf(el) {
  const t = el.text.trim()
  const cls = el.classes.join(' ')
  if (/\b(logo|brand|wordmark|nav-logo)\b/.test(cls) && words(t) <= 3) return 'brand'
  if (el.tag === 'h1') return 'headline'
  if (el.tag === 'h2') return 'title'
  if (el.tag === 'h3' || el.tag === 'h4') return 'subtitle'
  if (el.tag === 'blockquote') return 'quote'
  if (el.tag === 'button' || el.role === 'button' || /\b(btn|button|cta|pill-button)\b/.test(cls)) {
    return 'button'
  }
  if (el.tag === 'a') return el.ancestors.includes('nav') || el.ancestors.includes('header') ? 'nav' : 'link'
  if (isNumberish(t)) return 'number'
  if (el.tag === 'label' || el.tag === 'dt' || el.tag === 'th' || el.tag === 'legend' || el.tag === 'option')
    return 'label'
  if (isEyebrow(t) || /\b(eyebrow|kicker|overline|section-label)\b/.test(cls)) return 'eyebrow'
  if (el.beforeHeading && words(t) <= 6 && (el.tag === 'p' || el.tag === 'span' || el.tag === 'small'))
    return 'eyebrow'
  if (el.tag === 'p') return words(t) <= 4 ? 'label' : 'paragraph'
  // span · strong · em · small · li · td · dd · figcaption · summary
  return words(t) <= 5 ? 'label' : 'paragraph'
}

/**
 * The first manifest group whose selectors contain the element (or an ancestor). `matches` is
 * `(selector) => boolean`, supplied by the DOM side so this file stays DOM-free.
 * @param {{ id: string, selectors: string[] }[]} groups
 * @param {(selector: string) => boolean} matches
 * @returns {string | null}
 */
const GENERIC_GROUPS = new Set(['layout', 'typography'])

/**
 * @param {{ id: string, selectors: string[] }[]} groups
 * @param {(selector: string) => boolean} matches
 */
export function groupOf(groups, matches) {
  // `layout` and `typography` select containers and headings that wrap everything else; they are
  // the answer only when no component group claims the element.
  const ordered = [
    ...groups.filter((g) => !GENERIC_GROUPS.has(g.id)),
    ...groups.filter((g) => GENERIC_GROUPS.has(g.id))
  ]
  for (const g of ordered) {
    for (const sel of g.selectors ?? []) {
      // Pseudo-class selectors (`:hover`, `::placeholder`) describe states, not elements.
      if (sel.includes(':')) continue
      try {
        if (matches(sel)) return g.id
      } catch {
        /* an upstream selector this engine cannot parse: not a match */
      }
    }
  }
  return null
}

/**
 * One slot record. `n` is the element's index among ALL elements of its tag in body document order,
 * which is exactly what `document.body.querySelectorAll(tag)[n]` yields in a browser — the client
 * finds the element the same way the generator numbered it.
 */
/** @param {{ tag: string, n: number, text: string, role: string, group: string | null, inNav?: boolean }} slot */
export function slotRecord({ tag, n, text, role, group, inNav = false }) {
  const t = text.trim().replace(/\s+/g, ' ')
  return { id: `${tag}.${String(n)}`, tag, n, role, group, inNav, text: t, chars: t.length, words: words(t) }
}
