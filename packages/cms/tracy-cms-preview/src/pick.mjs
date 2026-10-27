/**
 * The picker's two pure halves: which element a pointer means, and what the page may say about it.
 *
 * Pure on purpose. Both take the document or the element they work on as an argument and touch no
 * global, so a test can hand them a stub DOM and hold the two promises that fail quietly in a
 * browser: a wrong hit-test still outlines SOMETHING, and a descriptor that leaks a form value reads
 * exactly like one that does not.
 */
import { INLINE_TAGS, INSIDE_MAX, LIMITS, TRACK_LIMITS } from '../protocol.mjs'

/** The attribute every element the picker draws carries, so the picker never picks itself. */
export const OWN = 'data-tracy-picker'

/** How far from the pointer the neighbour samples sit, in CSS pixels. */
const REACH = 10

/** Direct children of the element under the pointer looked at for a thin box between samples. */
const CHILDREN = 64

/** Tags whose own text is a value the visitor typed or chose, or code, never page copy. */
const SILENT = /^(INPUT|TEXTAREA|SELECT|OPTION|OPTGROUP|SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/

/** @param {Element} el */
function isOwn(el) {
  return el.hasAttribute(OWN)
}

/**
 * Ids of the boxes Tracy itself draws on a customer page (the seat pill and the demo advert,
 * `apps/tracy-web/src/lib/seat-badge.js`, `tracy-badge.js`, `build-with-tracy-demo.js`). They are not
 * the customer's page, so they are never picked (acceptance v3 K12: the "Managed with Tracy" badge was
 * picked as an empty `div`).
 */
const TRACY_IDS = /^(tracy-badge|build-with-tracy-demo)$/

/** @param {Element} el - whether it is, or sits inside, something Tracy drew: the picker's or a badge. */
function inTracyUi(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentElement)
    if (isOwn(node) || node.hasAttribute('data-tracy-badge') || TRACY_IDS.test(node.id || '')) return true
  return false
}

/** @param {Element} el - its computed style, or null where there is none to read. */
function styleOf(el) {
  const view = el.ownerDocument && el.ownerDocument.defaultView
  try {
    return view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(el) : null
  } catch {
    return null
  }
}

/**
 * Whether the person cannot see the element at all: it (or a box around it) is fully transparent, or
 * it is not painted (`visibility: hidden`). A fade carousel stacks its slides and shows one by
 * opacity; the hidden slide on top still answers `elementFromPoint`, so without this the outline was
 * drawn around the words on screen while Tracy received the invisible slide's (acceptance v3 K11).
 * Runtime 15 (acceptance v5 JS-v5-new-6, 7c, 7d): a `clip-path` that cuts all of it away
 * (`inset(100%)`, `inset(50%)`), a `clip` rectangle with no area (the screen-reader-only pattern), on
 * it or on a box around it, and a box around it whose contents the browser skips
 * (`content-visibility: hidden`) hide it too — the outline and the popover hung over empty space.
 * @param {Element} el
 */
export function unseen(el, cache = new Map()) {
  const own = styleOf(el)
  if (own !== null && (own.visibility === 'hidden' || own.visibility === 'collapse')) return true
  if (vanishes(el, own)) return true
  const parent = el.parentElement
  return parent !== null && parent !== undefined && parent.nodeType === 1 && hides(parent, cache)
}

/**
 * Whether `el` paints nothing of itself or its contents: fully transparent, or cut away whole by
 * `clip-path` or `clip`.
 * @param {Element} el @param {CSSStyleDeclaration | null} style - its computed style.
 */
function vanishes(el, style) {
  if (style === null) return false
  if (style.opacity !== undefined && style.opacity !== '' && Number(style.opacity) === 0) return true
  return cutAway(el, style)
}

/**
 * Whether `clip-path: inset(…)` or `clip: rect(…)` leaves nothing of `el`'s box.
 * @param {Element} el @param {CSSStyleDeclaration} style
 */
function cutAway(el, style) {
  const path = String(style.clipPath || '')
  const clip = String(style.clip || '')
  if (!path.startsWith('inset(') && !clip.startsWith('rect(')) return false
  const r = el.getBoundingClientRect()
  if (path.startsWith('inset(')) {
    // `inset(t r b l [round …])`, one to four lengths as margins go.
    const parts = path
      .replace(/^inset\(|\)$/g, '')
      .split(/\s+round\s+/)[0]
      .trim()
      .split(/\s+/)
    const [t, rt = t, b = t, l = rt] = parts
    const len = (v, size) =>
      v.endsWith('%') ? (Number.parseFloat(v) / 100) * size : Number.parseFloat(v) || 0
    if (len(t, r.height) + len(b, r.height) >= r.height || len(l, r.width) + len(rt, r.width) >= r.width)
      return true
  }
  if (clip.startsWith('rect(') && /^(absolute|fixed)$/.test(style.position || '')) {
    // `rect(top, right, bottom, left)`, each a length from the box's top-left or `auto` (its edge).
    const [top, right, bottom, left] = clip
      .replace(/^rect\(|\)$/g, '')
      .split(/\s*,\s*|\s+/)
      .map((v, i) => (v === 'auto' ? [0, r.width, r.height, 0][i] : Number.parseFloat(v) || 0))
    if (right <= left || bottom <= top) return true
  }
  return false
}

/**
 * Whether a box hides everything inside it: it vanishes itself, the browser skips its contents
 * (`content-visibility: hidden`), or a box around it does. Memoised per element in `cache`: the picker
 * asks this of every candidate on every pointer frame, and candidates share their ancestors.
 * @param {Element} el
 * @param {Map<Element, boolean>} cache
 */
function hides(el, cache) {
  const known = cache.get(el)
  if (known !== undefined) return known
  const style = styleOf(el)
  const parent = el.parentElement
  const answer =
    vanishes(el, style) ||
    (style !== null && style.contentVisibility === 'hidden') ||
    (parent !== null && parent !== undefined && parent.nodeType === 1 && hides(parent, cache))
  cache.set(el, answer)
  return answer
}

/** @param {Element} el - its box in the viewport, rounded: the `PickRect` every reply carries. */
export function box(el) {
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.left),
    y: Math.round(r.top),
    width: Math.round(r.width),
    height: Math.round(r.height)
  }
}

/**
 * How far outside its box a pointer may be and still mean this element. Scaled by area: a 1px rule
 * or a small icon is hard to land on and gets up to {@link REACH}; a section gets nothing.
 * @param {number} area
 */
function tolerance(area) {
  return Math.min(REACH, 2000 / Math.max(area, 1))
}

/** Elements that are content by what they are, words or not: media, controls, a visible rule. */
const CONTENT_TAGS =
  /^(IMG|SVG|VIDEO|AUDIO|CANVAS|PICTURE|IFRAME|OBJECT|EMBED|INPUT|BUTTON|SELECT|TEXTAREA|HR|METER|PROGRESS)$/i

/** @param {Element} el - whether an `<svg>` holds it (a path of an icon: the icon is the svg). */
function inSvg(el) {
  for (let node = el.parentElement; node && node.nodeType === 1; node = node.parentElement)
    if (/^svg$/i.test(node.tagName)) return true
  return false
}

/**
 * Whether the person can see something of this element's own: words (its text or its inline
 * descendants'), an image, a control. An empty wrapper, an icon span painted by CSS, a transparent
 * layer or a path inside an svg is not content — picking it hands Tracy a tag with no words.
 * @param {Element} el
 */
function hasContent(el) {
  if (CONTENT_TAGS.test(el.tagName)) return true
  if (inSvg(el)) return false
  if (wordsOf(el).trim() !== '') return true
  // A custom element whose words live in its open shadow root (runtime 14).
  if (el.shadowRoot && insideText(el) !== '') return true
  const style = styleOf(el)
  return style !== null && /url\(/.test(style.backgroundImage || '')
}

/**
 * Whether the page itself was hit rather than something on it: `html`, `body`, or a wrapper that
 * covers the whole body, within 2 % of its height (WordPress's `.wp-site-blocks`, T4's `.t4-wrapper`, an app root). Never an
 * answer (runtime 16): a click on empty space picked `<body>`, and Tracy was told "Skip to content".
 * @param {Element} el @param {Document} doc
 */
function isPageRoot(el, doc) {
  if (el === doc.documentElement || el === doc.body || /^(HTML|BODY)$/.test(el.tagName)) return true
  if (!doc.body || typeof doc.body.getBoundingClientRect !== 'function') return false
  const page = doc.body.getBoundingClientRect()
  if (!(page.height > 0 && page.width > 0)) return false
  const r = el.getBoundingClientRect()
  return r.width >= page.width - 1 && r.height >= page.height * 0.98
}

/**
 * Whether a line box of the element's own words holds the point: its text nodes and those of its
 * inline descendants (the `INLINE_TAGS` rule `wordsOf` reads by), measured by a range. A small word
 * earns the tolerance a small box does. Without ranges (no layout to ask), any words count, as
 * before runtime 16.
 * @param {Element} el @param {number} x @param {number} y
 */
function wordsAt(el, x, y) {
  const doc = el.ownerDocument
  if (!doc || typeof doc.createRange !== 'function') return wordsOf(el).trim() !== ''
  const range = doc.createRange()
  const hit = (node) => {
    for (const kid of node.childNodes) {
      if (kid.nodeType === 3) {
        if (!kid.nodeValue || kid.nodeValue.trim() === '') continue
        range.selectNodeContents(kid)
        for (const r of range.getClientRects()) {
          const t = tolerance(r.width * r.height)
          if (x >= r.left - t && x <= r.right + t && y >= r.top - t && y <= r.bottom + t) return true
        }
      } else if (
        kid.nodeType === 1 &&
        INLINE.has(kid.tagName) &&
        !kid.hasAttribute('data-tracy-private') &&
        !isOwn(kid) &&
        hit(kid)
      )
        return true
    }
    return false
  }
  return hit(el)
}

/**
 * Whether the person sees something of this element's own AT the pointer (runtime 16, acceptance v5
 * PICK-new-14): it is an image or a control, or a line of its own words holds the point, or it paints
 * a background image there. Words elsewhere in the element do not count — `body` holds the skip link,
 * a hero column holds its heading, and either one won a click on empty space. An open shadow host's
 * words are read as a whole (the pointer cannot be matched to their boxes from outside).
 * @param {Element} el @param {number} x @param {number} y
 */
function contentAt(el, x, y) {
  if (CONTENT_TAGS.test(el.tagName)) return true
  if (inSvg(el)) return false
  if (wordsAt(el, x, y)) return true
  if (el.shadowRoot && insideText(el) !== '') return true
  const style = styleOf(el)
  return style !== null && /url\(/.test(style.backgroundImage || '')
}

/**
 * Whether the element paints something over what lies under it, so a person cannot see through it
 * there: content of its own (`hasContent`) or a background. A transparent layer laid over a hero
 * (a link that covers a card, an animation wrapper) hides nothing, and an invisible slide neither.
 * @param {Element} el
 */
export function paintsOver(el) {
  if (unseen(el)) return false
  const style = styleOf(el)
  const color = style === null ? '' : String(style.backgroundColor || '')
  const solid = color !== '' && color !== 'transparent' && !/rgba\([^)]*,\s*0(\.0+)?\s*\)$/.test(color)
  return solid || hasContent(el)
}

/** Elements a person operates: what an icon inside one means. */
const CONTROL_TAGS = /^(A|BUTTON|SUMMARY|LABEL)$/
const CONTROL_ROLES =
  /^(button|link|menuitem|menuitemcheckbox|menuitemradio|tab|switch|checkbox|radio|option)$/

/** Elements that are content by what they show — an icon inside a control never stands for these. */
const SHOWN_TAGS =
  /^(IMG|VIDEO|AUDIO|CANVAS|PICTURE|IFRAME|OBJECT|EMBED|INPUT|SELECT|TEXTAREA|METER|PROGRESS)$/

/** @param {Element} el */
function isControl(el) {
  if (CONTROL_TAGS.test(el.tagName)) return el.tagName !== 'A' || el.hasAttribute('href')
  return CONTROL_ROLES.test((el.getAttribute('role') || '').trim())
}

/**
 * The control an icon stands in for (runtime 14, acceptance v3 K04/K13): an element with no words of
 * its own that is not an image or a field — an svg, a path of one, a CSS-drawn caret span — inside a
 * button, a link or an element with a control role, picks that control, which carries the words or
 * the accessible label (`name`). The magnifier `<path>` of a search button sent Tracy `tag: "path"`
 * and no words; a caret span sent an empty span.
 * @param {Element} el
 * @returns {Element} the control, or `el` itself.
 */
function controlOf(el) {
  if (isControl(el) || SHOWN_TAGS.test(el.tagName) || wordsOf(el).trim() !== '') return el
  let node = el.parentElement
  for (let i = 0; node && node.nodeType === 1 && i < 6; i += 1, node = node.parentElement)
    if (isControl(node)) return node
  return el
}

/** Embeds the pointer cannot reach while picking (the runtime makes them transparent to it). */
const EMBED_TAGS = /^(IFRAME|EMBED|OBJECT)$/

/**
 * The embed under the pointer, when nothing of the page is painted over it there (runtime 14,
 * acceptance v3 K10). While picking, the runtime makes iframes, embeds and objects transparent to the
 * pointer — otherwise the frame inside swallows every move and click and the page never hears them —
 * so `elementFromPoint` answers with what lies under the embed. The embed is on top at that point
 * when that answer is one of its ancestors (a fixed bar painted over it answers itself instead).
 * @param {number} x @param {number} y @param {Document} doc @param {Element} center
 * @returns {Element | null}
 */
function embedAt(x, y, doc, center) {
  if (typeof doc.querySelectorAll !== 'function') return null
  let found = null
  let area = Infinity
  for (const el of doc.querySelectorAll('iframe, embed, object')) {
    if (isOwn(el) || unseen(el)) continue
    const r = el.getBoundingClientRect()
    if (!(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) || !(r.width * r.height > 0)) continue
    let above = false
    for (let node = el.parentElement; node && node.nodeType === 1 && !above; node = node.parentElement)
      above = node === center
    if (above && r.width * r.height < area) {
      found = el
      area = r.width * r.height
    }
  }
  return found
}

/**
 * The candidates that hold the pointer, smallest box first (a tie keeps candidate order).
 * @param {Element[]} candidates
 * @param {number} x
 * @param {number} y
 * @returns {Element[]}
 */
function holders(candidates, x, y) {
  const out = []
  for (const el of candidates) {
    const r = el.getBoundingClientRect()
    const area = r.width * r.height
    if (!(area > 0)) continue
    const t = tolerance(area)
    if (x >= r.left - t && x <= r.right + t && y >= r.top - t && y <= r.bottom + t) out.push({ el, area })
  }
  return out.sort((a, b) => a.area - b.area).map((one) => one.el)
}

/**
 * The element a pointer at (x, y) means: the smallest box WITH CONTENT that holds the pointer.
 *
 * Claude Design's rule (`n0`): the element under the pointer and under eight neighbour points at
 * ±10px, plus all their ancestors, are the candidates; each holds the pointer within a tolerance
 * that shrinks as its box grows; the smallest wins. Neighbour samples catch the thin element the
 * pointer is just beside. One addition: the direct children of the element under the pointer are
 * candidates too, because a 1px rule 5px away falls BETWEEN samples 10px apart and would otherwise
 * never be found.
 *
 * Runtime 13 (stage 6 acceptance v2, K01/K04): among the boxes that hold the pointer, the smallest
 * one with content (`hasContent`: words, an image, a control) wins, so an empty wrapper smaller than
 * its heading or a CSS icon span inside a worded button no longer takes the pick. When nothing on
 * top has content, the elements painted UNDER the pointer are looked at too (`elementsFromPoint`): a
 * transparent layer laid over a hero hid its H1 from `elementFromPoint`. Only when none of those has
 * content does the plain smallest box win — a click on a section's empty space still picks the
 * section.
 *
 * The picker's own overlay is skipped wherever it turns up — it is drawn with `pointer-events:none`,
 * but a page that restyles unknown elements must not be able to make the picker pick its outline.
 * @param {number} x - viewport x of the pointer.
 * @param {number} y - viewport y of the pointer.
 * @param {Document} doc - the document to look in.
 * @returns {Element | null} null when nothing is under the pointer.
 */
export function pickAt(x, y, doc) {
  const seen = new Set()
  const candidates = []
  const clear = new Map()
  const add = (el) => {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      if (seen.has(node)) return
      seen.add(node)
      if (!isOwn(node) && !unseen(node, clear)) candidates.push(node)
    }
  }
  let center = doc.elementFromPoint(x, y)
  while (center && isOwn(center)) center = center.parentElement
  if (!center) return null
  // Tracy's own badge is not the customer's page: over it, nothing is picked (runtime 14).
  if (inTracyUi(center)) return null
  const embed = embedAt(x, y, doc, center)
  if (embed !== null) return embed
  const el = chosen(x, y, doc, center, add, seen, candidates, clear)
  return el === null ? null : controlOf(el)
}

/**
 * The runtime-13 choice among the candidates (see {@link pickAt}), before an icon defers to its
 * control.
 * @returns {Element | null}
 */
function chosen(x, y, doc, center, add, seen, candidates, clear) {
  add(center)
  for (const dx of [-REACH, 0, REACH])
    for (const dy of [-REACH, 0, REACH]) if (dx !== 0 || dy !== 0) add(doc.elementFromPoint(x + dx, y + dy))
  const kids = center.children
  for (let i = 0; i < kids.length && i < CHILDREN; i += 1)
    if (!seen.has(kids[i]) && !isOwn(kids[i]) && !unseen(kids[i], clear)) {
      seen.add(kids[i])
      candidates.push(kids[i])
    }
  const top = holders(candidates, x, y).filter((el) => !isPageRoot(el, doc))
  const here = (el) => contentAt(el, x, y)
  const worded = top.find(here)
  if (worded !== undefined) return worded
  if (typeof doc.elementsFromPoint === 'function') {
    const under = []
    const before = candidates.length
    for (const el of doc.elementsFromPoint(x, y) || []) if (el && !isOwn(el) && !inTracyUi(el)) add(el)
    for (let i = before; i < candidates.length; i += 1) under.push(candidates[i])
    const beneath = holders(under, x, y)
      .filter((el) => !isPageRoot(el, doc))
      .find(here)
    if (beneath !== undefined) return beneath
  }
  return top.length > 0 ? top[0] : null
}

/** @param {Element} el - whether the element or an ancestor asked to be kept out of every descriptor. */
function isPrivate(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentElement)
    if (node.hasAttribute('data-tracy-private') || node.tagName === 'SELECT' || node.tagName === 'TEXTAREA')
      return true
  return false
}

/** Descendants whose words are part of the element's text (`INLINE_TAGS`, `protocol.mjs`). */
const INLINE = new Set(INLINE_TAGS.map((tag) => tag.toUpperCase()))

/**
 * Whether the page lays an inline tag out as a block of its own (`display: block`, `flex`, `grid`,
 * `list-item`, `table`…): a T4 mega-menu link's title and description spans shown as two lines
 * (verify6 L3). Their words are then separate words, not glued ("NewsletterDigest").
 * @param {Element} el
 */
function laidOutAsBlock(el) {
  const style = styleOf(el)
  const display = style ? style.display : ''
  return (
    typeof display === 'string' &&
    display !== '' &&
    !display.startsWith('inline') &&
    display !== 'contents' &&
    display !== 'none'
  )
}

/**
 * The raw words of one element by the `INLINE_TAGS` rule: its text nodes, the words of inline
 * descendants, one space for any other element. An inline tag laid out as a block keeps its words
 * but is set apart by a space on each side. A private or picker-drawn descendant says nothing.
 * @param {Element} el
 */
function wordsOf(el) {
  let text = ''
  for (const node of el.childNodes) {
    if (node.nodeType === 3) text += node.nodeValue
    else if (node.nodeType !== 1 || node.tagName === 'WBR') continue
    else if (INLINE.has(node.tagName) && !node.hasAttribute('data-tracy-private') && !isOwn(node))
      text += laidOutAsBlock(node) ? ` ${wordsOf(node)} ` : wordsOf(node)
    else text += ' '
  }
  return text
}

/**
 * The element's visible text — its own text nodes plus its inline descendants' (a heading's link,
 * a paragraph's bold word), never a block descendant's — whitespace-collapsed and capped. Empty for
 * a form control, code, or anything inside a `[data-tracy-private]` subtree.
 * @param {Element} el
 */
export function ownText(el) {
  if (SILENT.test(el.tagName) || isPrivate(el)) return ''
  return capText(wordsOf(el).replace(/\s+/g, ' ').trim())
}

/**
 * Text capped at `LIMITS.text`, ending in `…` when it was cut. The mark is the point: the agent is told
 * to replace an element's words "as the text line shows them", and a silent cut made that a real find
 * — the first 300 characters of a longer paragraph matched, were replaced, and the old tail stayed
 * behind the new words. With the mark the cut text no longer matches anything, so the edit fails
 * safely and the agent reads the record first.
 * @param {string} text - whitespace-collapsed text.
 */
function capText(text) {
  return text.length <= LIMITS.text ? text : `${text.slice(0, LIMITS.text - 1)}…`
}

/**
 * The words of a whole subtree, for a picked container that has none of its own (a card, a section):
 * every text node below it in reading order, a space between blocks, whitespace-collapsed and cut at
 * {@link INSIDE_MAX} with the same `…` mark as `text`. A private subtree, a form control, code and
 * anything the picker drew say nothing. Stops reading once the cap is passed, so a page-sized
 * container costs a few hundred characters of work, not the whole document.
 * @param {Element} el
 * @returns {string} empty when the subtree has no words.
 */
function insideText(el) {
  if (SILENT.test(el.tagName) || isPrivate(el)) return ''
  let text = ''
  /**
   * @param {Element | ShadowRoot} node
   * @param {Element | null} host - the element whose open shadow root is being read: a `<slot>` in it
   *   stands for the host's own children (runtime 14; a named slot for the children naming it).
   */
  const walk = (node, host) => {
    // An open shadow root is what the person sees of a custom element; a closed one says nothing.
    const from = node.nodeType === 1 && node.shadowRoot ? node.shadowRoot : node
    const inner = from === node ? host : /** @type {Element} */ (node)
    for (const child of from.childNodes) {
      if (text.length > INSIDE_MAX * 2) return
      if (child.nodeType === 3) text += child.nodeValue
      else if (child.nodeType === 1) {
        const kid = /** @type {Element} */ (child)
        if (
          SILENT.test(kid.tagName) ||
          kid.tagName === 'WBR' ||
          isOwn(kid) ||
          kid.hasAttribute('data-tracy-private')
        )
          continue
        if (kid.tagName === 'SLOT' && inner !== null) {
          const slot = kid.getAttribute('name') || ''
          for (const light of inner.childNodes)
            if (light.nodeType === 3 ? slot === '' : (light.getAttribute('slot') || '') === slot) {
              if (light.nodeType === 3) text += light.nodeValue
              else {
                text += ' '
                walk(light, null)
                text += ' '
              }
            }
          continue
        }
        const inline = INLINE.has(kid.tagName)
        if (!inline) text += ' '
        walk(kid, inner)
        if (!inline) text += ' '
      }
    }
  }
  walk(el, null)
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= INSIDE_MAX ? flat : `${flat.slice(0, INSIDE_MAX - 1)}…`
}

/** @param {Element} el - the provenance stamps this one element carries, in reading order. */
function marksOf(el) {
  const out = []
  const src = el.getAttribute('data-tracy-src')
  if (src && src.trim()) out.push(src.trim())
  for (const kid of el.children) {
    if (kid.tagName !== 'TEMPLATE') continue
    const owner = kid.getAttribute('data-tracy-owner')
    if (owner && owner.trim()) out.push(owner.trim())
  }
  if (el.tagName === 'LI') {
    const item = /(?:^|\s)item-(\d+)(?:\s|$)/.exec(el.getAttribute('class') || '')
    const id = item ? item[1] : el.getAttribute('data-id')
    if (id && /^\d+$/.test(id)) out.push(`menuItem:${id}`)
  }
  return out
}

/** How many ancestors `levelElements` walks before it stops looking (a deep page's wrappers). */
const LEVEL_WALK = 40

/**
 * Tags the side card has a word of its own for (`comment-path.ts` `NAMES` in dsh-better-sidebar);
 * any other tag reads "Block" there. Kept in step by hand: a tag missing here only collapses as a
 * wrapper, a tag missing there only reads "Block".
 */
const WORDED =
  /^(SECTION|HEADER|FOOTER|NAV|MAIN|ARTICLE|ASIDE|FORM|FIELDSET|H[1-6]|P|SPAN|SMALL|STRONG|EM|B|LABEL|FIGCAPTION|CITE|TIME|CODE|PRE|A|BUTTON|SUMMARY|IMG|PICTURE|FIGURE|CANVAS|SVG|I|UL|OL|DL|MENU|LI|DT|DD|TABLE|THEAD|TBODY|TFOOT|TR|TD|TH|INPUT|TEXTAREA|SELECT|VIDEO|IFRAME|EMBED|OBJECT|BLOCKQUOTE|Q)$/

/** The landmark an element is by its tag, as the side card's word for that tag. */
const LANDMARK_TAG = Object.freeze({
  HEADER: 'header',
  FOOTER: 'footer',
  NAV: 'nav',
  MAIN: 'main',
  ASIDE: 'aside',
  FORM: 'form'
})

/** The landmark an element is by its ARIA role, named by the tag that has that role. */
const LANDMARK_ROLE = Object.freeze({
  banner: 'header',
  contentinfo: 'footer',
  navigation: 'nav',
  main: 'main',
  complementary: 'aside',
  form: 'form',
  search: 'form'
})

/** @param {Element} el - the landmark it is (`header`, `footer`, `nav`, `main`, `aside`, `form`), its role first, or null. */
function landmarkOf(el) {
  const role = flat(el.getAttribute('role')).toLowerCase().split(' ')[0]
  return LANDMARK_ROLE[role] ?? LANDMARK_TAG[el.tagName] ?? null
}

/** A level's name is at most this long, cut with `…`: the side card shows a short slice of it. */
const LEVEL_NAME_MAX = 80

/** Elements a container's headings are looked for among, at most: a page-sized one says nothing. */
const HEADING_WALK = 1500

/**
 * The headings in `el`'s subtree in reading order (itself when it is one; never inside a heading, a
 * private subtree, a form control or what the picker drew), or null past {@link HEADING_WALK}.
 * @param {Element} el
 * @returns {Element[] | null}
 */
function headingsIn(el) {
  const out = []
  const stack = [el]
  for (let seen = 0; stack.length > 0; seen += 1) {
    if (seen > HEADING_WALK) return null
    const node = stack.pop()
    if (isOwn(node) || node.hasAttribute('data-tracy-private') || SILENT.test(node.tagName)) continue
    if (HEADING.test(node.tagName)) {
      out.push(node)
      continue
    }
    for (let i = node.children.length - 1; i >= 0; i -= 1) stack.push(node.children[i])
  }
  return out
}

/**
 * The words of the heading that titles `el` as one block among others, or ''. A heading titles it when
 * it is the first heading inside it, every other heading inside it ranks lower (a section's h2 over
 * its cards' h3s), and its parent holds a heading outside it — so a page's content wrapper, whose
 * first heading is the first section's, is not named after that section, and of a run of wrappers
 * around one hero only the one standing among the page's other blocks is.
 * @param {Element} el
 */
function titleOf(el) {
  const parent = el.parentElement
  if (!parent) return ''
  const own = headingsIn(el)
  if (own === null || own.length === 0) return ''
  const rank = Number(own[0].tagName[1])
  if (own.some((heading, i) => i > 0 && Number(heading.tagName[1]) <= rank)) return ''
  let among = false
  for (const kid of parent.children) {
    if (kid === el) continue
    const theirs = headingsIn(kid)
    if (theirs !== null && theirs.length > 0) {
      among = true
      break
    }
  }
  return among ? wordsIn(own[0]) : ''
}

/**
 * What the page itself calls a container (runtime 20), or '': its explicit label (`aria-label`,
 * `aria-labelledby`), else — when it is no landmark, whose word the side card says itself — the words
 * of the heading that titles it ({@link titleOf}). Never a word the page does not show or say.
 * @param {Element} el
 */
function levelName(el) {
  if (isPrivate(el)) return ''
  const label = flat(el.getAttribute('aria-label')) || labelledBy(el)
  const name = label !== '' ? label : landmarkOf(el) === null ? flat(titleOf(el)) : ''
  return name.length <= LEVEL_NAME_MAX ? name : `${name.slice(0, LEVEL_NAME_MAX - 1)}…`
}

/** @param {Element} node - whether the side card could only call it "Block": no mark, name, landmark or word of its own. */
function anonymous(node) {
  return (
    marksOf(node).length === 0 &&
    !WORDED.test(node.tagName) &&
    landmarkOf(node) === null &&
    levelName(node) === ''
  )
}

/** @param {Element} node - whether it says more than its tag's word: a name or a landmark. */
function telling(node) {
  return landmarkOf(node) !== null || levelName(node) !== ''
}

/**
 * The elements the pick can move to: the element itself, then its ancestors a person can tell apart,
 * innermost first, capped at `LIMITS.levels`. The runtime keeps this list so `pick-level {index}`
 * can move the pick without the side card ever naming an element.
 *
 * An ancestor carrying a mark always counts. Since runtime 19 (feature `widen`, the side card's path
 * line "Section › Block › Heading") so does one that only draws a box of its own: not the page itself
 * (`html`, `body`, a wrapper covering the body), not Tracy's drawings, and not a wrapper whose box is
 * the same as the level inside it (a `div` around one `h1` adds a step that outlines nothing new).
 * Before 19 a page without marks (most WordPress and Joomla pages) had one level: the element.
 *
 * Since runtime 20 (Akemi 01/10/2026, the kinetic hero read "Block › Block › Block › Block › Heading"):
 * a run of anonymous ancestors (see `anonymous`) is ONE level, the OUTERMOST of the run — pressing
 * that step widens the pick as far as the run reaches, which is what a person climbing the path wants,
 * and the innermost of a run mostly hugs the element already picked. And of two ancestors with the
 * same box, one with a name or a landmark (`main` around WordPress's post content) takes the place of
 * one without. The list holds only the kept elements, so `pick-level {index}` still indexes it 1:1.
 * @param {Element} el
 * @returns {Element[]}
 */
export function levelElements(el) {
  const out = [el]
  const doc = el.ownerDocument
  let last = box(el)
  let lastAnonymous = false
  let walked = 0
  for (
    let node = el.parentElement;
    node && node.nodeType === 1 && out.length < LIMITS.levels && walked < LEVEL_WALK;
    node = node.parentElement
  ) {
    walked += 1
    if (marksOf(node).length > 0) {
      out.push(node)
      last = box(node)
      lastAnonymous = false
      continue
    }
    if (isOwn(node) || (doc && isPageRoot(node, doc)) || /^(HTML|BODY)$/.test(node.tagName)) continue
    const r = box(node)
    if (r.width <= 0 || r.height <= 0) continue
    const top = out.length - 1
    if (sameBox(r, last)) {
      // The same box twice: keep the one that says more, never in place of the element itself.
      if (top > 0 && marksOf(out[top]).length === 0 && !telling(out[top]) && telling(node)) {
        out[top] = node
        lastAnonymous = false
      }
      continue
    }
    const plain = anonymous(node)
    if (plain && lastAnonymous && top > 0) {
      out[top] = node
      last = r
      continue
    }
    out.push(node)
    last = r
    lastAnonymous = plain
  }
  return out
}

/** @param {{x:number,y:number,width:number,height:number}} a @param {typeof a} b - within 1px on every edge. */
function sameBox(a, b) {
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.width - b.width) <= 1 &&
    Math.abs(a.height - b.height) <= 1
  )
}

/**
 * One entry of `levels`: its tag, its first mark, its own words and its box; for an ancestor (not the
 * element first picked, which the side card names by its tag) also what the page calls it (`name`) and
 * the landmark it is (`landmark`), each only when there is one (runtime 20).
 * @param {Element} node @param {number} index - its place in the levels, 0 the element itself.
 */
function levelOf(node, index) {
  const own = marksOf(node)
  const name = index > 0 ? levelName(node) : ''
  const landmark = index > 0 ? landmarkOf(node) : null
  return {
    tag: node.tagName.toLowerCase(),
    mark: own.length > 0 ? own[0] : null,
    text: ownText(node),
    rect: box(node),
    ...(name === '' ? {} : { name }),
    ...(landmark === null ? {} : { landmark })
  }
}

/**
 * The pick moved to one of its levels (runtime 19, `pick-level`): the level's own description —
 * words, selector, marks, box — with the levels of the FIRST pick kept, so the side card's path line
 * still lists every step and can go back down, and `level` saying which of them this is.
 * @param {Element[]} levelEls - the first pick's `levelElements`.
 * @param {number} index - which of them is picked now.
 * @returns {import('../protocol.mjs').PickTarget}
 */
export function widened(levelEls, index) {
  return { ...describe(levelEls[index]), levels: levelEls.map(levelOf), level: index }
}

/** @param {Element} el - `tag#id.class1.class2.class3`, the shape a person reads in a path. */
function segment(el) {
  let out = el.tagName.toLowerCase()
  if (el.id) out += `#${el.id}`
  const classes = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 3)
  for (const name of classes) out += `.${name}`
  return out
}

/**
 * Class names that say how an element is now, not what it is: they come and go as the page runs.
 * A step named by one would stop matching the moment a slide turns or a menu closes.
 */
const STATE_CLASS =
  /^(is-|has-|js-|ng-|v-|wp-container-)|(^|-)(active|current|open|opened|closed|show|shown|hidden|hide|visible|selected|focus|focused|hover|expanded|collapsed|disabled|enabled|checked|loading|loaded|animated|in-view|sticky|fixed|scrolled|aos-animate)$|^(slick-|swiper-slide-|owl-|splide__slide--)/

/**
 * A class that names this one child of its parent among children of its tag, and looks like a name
 * rather than a state or a generated hash (runtime 14, acceptance v3 J18): a step `button.cta-primary`
 * survives a sibling added before it, where `button:nth-child(2)` then names the sibling.
 * @param {Element} node @param {Element} parent
 * @returns {string | null}
 */
function stableClass(node, parent) {
  const names = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)
  for (const name of names) {
    if (!/^[A-Za-z][\w-]*$/.test(name) || STATE_CLASS.test(name) || /\d{3,}|[0-9a-f]{6,}/i.test(name))
      continue
    let same = 0
    for (const kid of parent.children)
      if (kid.tagName === node.tagName && (kid.getAttribute('class') || '').split(/\s+/).includes(name))
        same += 1
    if (same === 1) return name
  }
  return null
}

/**
 * A selector that matches exactly this element: from the nearest ancestor with a unique id (or the
 * root) down, one `tag:nth-child(n)` per step — unique by construction, however the page is built.
 * @param {Element} el
 */
function selectorOf(el) {
  const doc = el.ownerDocument
  const only = (selector) => {
    try {
      const found = doc.querySelectorAll(selector)
      return found.length === 1 && found[0] === el
    } catch {
      return false
    }
  }
  const parts = []
  for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
    if (
      node.id &&
      /^[A-Za-z][\w-]*$/.test(node.id) &&
      doc &&
      doc.querySelectorAll(`#${node.id}`).length === 1
    ) {
      parts.unshift(`#${node.id}`)
      break
    }
    const parent = node.parentElement
    const tag = node.tagName.toLowerCase()
    if (!parent) {
      parts.unshift(tag)
      break
    }
    const named = stableClass(node, parent)
    parts.unshift(
      named === null
        ? `${tag}:nth-child(${String(Array.prototype.indexOf.call(parent.children, node) + 1)})`
        : `${tag}.${named}`
    )
    // Runtime 14 (acceptance v3 V3S-7): stop as soon as the steps so far name this one element. The
    // path from the root of a deep header ran past 250 characters (a Polylang flag), and the chat turn,
    // which cuts selectors to fit, then sent none. Shorter is still exact: `locate` holds an item only
    // when its selector finds exactly one element, so a page that later grows a second match loses the
    // item rather than moving it.
    if (doc && parts.length >= 2 && only(parts.join(' > '))) break
  }
  return parts.join(' > ')
}

/**
 * The one `<img>` a text-less wrapper holds — a card's image link, `<a><figure><picture><img>` —
 * or null. Null when any text node below the wrapper has words (a "Read more" link, a figure with a
 * caption: the person may mean the words) or when it holds no image or more than one (which of them
 * would be a guess).
 * @param {Element} el
 * @returns {Element | null}
 */
function soleImage(el) {
  let found = null
  let count = 0
  let worded = false
  /** @param {Element} node */
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (worded || count > 1) return
      if (child.nodeType === 3) {
        if ((child.nodeValue || '').trim() !== '') worded = true
      } else if (child.nodeType === 1 && !isOwn(child)) {
        if (child.tagName === 'IMG') {
          found = child
          count += 1
        } else walk(child)
      }
    }
  }
  walk(el)
  return !worded && count === 1 ? found : null
}

/**
 * What an image shows: an `<img>`'s source actually displayed, or a CSS background image. A URL
 * longer than 2 KB is almost always an inlined `data:` image and is dropped rather than cut.
 *
 * A picked element with no image of its own that is only a wrapper around ONE `<img>` (runtime 8)
 * reports that image: the pointer on a card's linked image lands on the `<a>`, whose box is the
 * image's, and without this "change the alt" had no image to find. Only the image is borrowed —
 * the pick, its outline, box and selector stay the wrapper's.
 * @param {Element} el
 */
function imageOf(el) {
  let src = ''
  let alt = ''
  let shown = el
  if (el.tagName === 'IMG') {
    src = el.currentSrc || el.src || ''
    alt = el.alt || ''
  } else {
    const view = el.ownerDocument && el.ownerDocument.defaultView
    const style = view && typeof view.getComputedStyle === 'function' ? view.getComputedStyle(el) : null
    const match = style ? /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(style.backgroundImage || '') : null
    if (match) src = match[1]
    else {
      const img = soleImage(el)
      if (img) {
        shown = img
        src = img.currentSrc || img.src || ''
        alt = img.alt || ''
      }
    }
  }
  if (!src || src.length > 2048 || isPrivate(shown)) return null
  return { src, alt: alt.slice(0, LIMITS.text) }
}

/** @param {Element} el - its words, or the words inside it, flattened and capped. */
function wordsIn(el) {
  return ownText(el) || insideText(el)
}

/** @param {string} value - an attribute's words, flattened; '' for none. */
function flat(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/**
 * The words the element's `aria-labelledby` points at, joined, or ''.
 * @param {Element} el
 */
function labelledBy(el) {
  const doc = el.ownerDocument
  const ids = flat(el.getAttribute('aria-labelledby'))
  if (ids === '' || !doc || typeof doc.getElementById !== 'function') return ''
  const words = []
  for (const id of ids.split(' ')) {
    const target = doc.getElementById(id)
    if (target && !isPrivate(target)) words.push(wordsIn(target))
  }
  return flat(words.join(' '))
}

/** The `<title>` of the element when it is an svg, or of the one svg it holds (an icon link), or ''. */
function svgTitle(el) {
  const svg = /^svg$/i.test(el.tagName)
    ? el
    : Array.prototype.find.call(el.children, (kid) => /^svg$/i.test(kid.tagName))
  if (!svg) return ''
  const title = Array.prototype.find.call(svg.children, (kid) => /^title$/i.test(kid.tagName))
  return title ? flat(insideText(title)) : ''
}

/** Headings, whose words say what the content after them is about. */
const HEADING = /^H[1-6]$/

/** The last heading in `node`'s subtree (itself included), looking at most `depth` levels down. */
function lastHeading(node, depth) {
  if (HEADING.test(node.tagName)) return node
  if (depth === 0) return null
  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const found = lastHeading(node.children[i], depth - 1)
    if (found) return found
  }
  return null
}

/**
 * The words of the heading just above `el` in the page — before it among its siblings, or its
 * ancestors' — or ''. Bounded: a few ancestors, a few siblings each, a few levels down.
 * @param {Element} el
 */
function headingAbove(el) {
  let node = el
  for (let up = 0; node && node.nodeType === 1 && up < 5; up += 1, node = node.parentElement) {
    const parent = node.parentElement
    if (!parent) break
    const kids = parent.children
    for (let i = Array.prototype.indexOf.call(kids, node) - 1, n = 0; i >= 0 && n < 8; i -= 1, n += 1) {
      const heading = lastHeading(kids[i], 3)
      if (heading && !isPrivate(heading)) {
        const words = wordsIn(heading)
        if (words !== '') return words
      }
    }
  }
  return ''
}

/** The caption of the figure an image sits in (up to two wrappers away), or ''. */
function captionOf(el) {
  let node = el.parentElement
  for (let i = 0; node && node.nodeType === 1 && i < 3; i += 1, node = node.parentElement) {
    if (node.tagName !== 'FIGURE') continue
    const caption = Array.prototype.find.call(node.children, (kid) => kid.tagName === 'FIGCAPTION')
    return caption && !isPrivate(caption) ? wordsIn(caption) : ''
  }
  return ''
}

/** Hosts whose embeds are videos, and maps. */
const VIDEO_HOST =
  /(^|\.)(youtube\.com|youtube-nocookie\.com|youtu\.be|vimeo\.com|wistia\.(com|net)|loom\.com|dailymotion\.com|rutube\.ru|vk\.com|vkvideo\.ru)$/
const MAP_HOST = /(^|\.)(openstreetmap\.org|mapbox\.com|2gis\.[a-z]+)$/

/**
 * An embed in plain words: `embedded video "Company film" · youtube.com`. Only the HOST of its
 * address leaves the page — an embed's address can carry a token, and the host is all a person needs
 * to recognise it.
 * @param {Element} el
 */
function embedName(el) {
  const raw = (el.getAttribute(el.tagName === 'OBJECT' ? 'data' : 'src') || '').trim()
  let host = ''
  let path = ''
  // No address (a `srcdoc` frame): no host — not the page's own, which a relative '' would resolve to.
  if (raw !== '')
    try {
      const base = el.ownerDocument && el.ownerDocument.baseURI ? el.ownerDocument.baseURI : undefined
      const url = new URL(raw, base)
      if (/^https?:$/.test(url.protocol)) {
        host = url.hostname.replace(/^www\./, '')
        path = url.pathname
      }
    } catch {
      // No usable address (srcdoc, about:blank): an embed with no host.
    }
  const map =
    MAP_HOST.test(host) ||
    (/^(maps\.)?google\.[a-z.]+$/.test(host) && path.startsWith('/maps')) ||
    host.startsWith('maps.') ||
    (/(^|\.)yandex\.[a-z]+$/.test(host) && path.startsWith('/map'))
  const kind = VIDEO_HOST.test(host) ? 'video' : map ? 'map' : 'content'
  const title = flat(el.getAttribute('title')) || flat(el.getAttribute('aria-label'))
  return `embedded ${kind}${title === '' ? '' : ` "${title}"`}${host === '' ? '' : ` · ${host}`}`
}

/**
 * What a person calls an element that has no words of its own (runtime 14, feature `name`), or ''.
 * See `PickTarget.name` in `protocol.mjs`: an embed as such, an accessible label, an image's alt, its
 * figure's caption or the heading above it, an svg's title.
 * @param {Element} el
 */
function nameOf(el) {
  if (isPrivate(el)) return ''
  if (EMBED_TAGS.test(el.tagName)) return embedName(el)
  const label = flat(el.getAttribute('aria-label')) || labelledBy(el)
  if (label !== '') return label
  if (el.tagName === 'CANVAS') {
    const heading = flat(el.getAttribute('title')) === '' ? headingAbove(el) : ''
    return (
      flat(el.getAttribute('title')) ||
      (heading === ''
        ? 'canvas'
        : `canvas near "${heading.length > 80 ? `${heading.slice(0, 79)}…` : heading}"`)
    )
  }
  const img = el.tagName === 'IMG' ? el : soleImage(el)
  if (img) return flat(img.alt) || captionOf(img) || flat(img.getAttribute('title')) || nearImage(img)
  return flat(el.getAttribute('title')) || svgTitle(el)
}

/** @param {Element} img - `image near "<heading>"` for an image with no alt or caption, or ''. */
function nearImage(img) {
  const heading = headingAbove(img)
  return heading === '' ? '' : `image near "${heading.length > 80 ? `${heading.slice(0, 79)}…` : heading}"`
}

/**
 * What the page says about one element — a `PickTarget` (`protocol.mjs`). Bounded by `LIMITS`, and
 * never carrying a form value, a private subtree's text or code: the page is the customer's, and
 * the side card needs enough to name the element and its source, not a copy of the document.
 * @param {Element} el
 * @returns {import('../protocol.mjs').PickTarget}
 */
export function describe(el) {
  const path = []
  for (let node = el; node && node.nodeType === 1 && path.length < LIMITS.domPath; node = node.parentElement)
    path.unshift(segment(node))
  const marks = []
  for (let node = el; node && node.nodeType === 1 && marks.length < LIMITS.marks; node = node.parentElement)
    for (const mark of marksOf(node))
      if (marks.length < LIMITS.marks && !marks.includes(mark)) marks.push(mark)
  const levels = levelElements(el).map(levelOf)
  const text = ownText(el)
  const inside = text === '' ? insideText(el) : ''
  const name = text === '' ? capText(nameOf(el)) : ''
  return {
    text,
    ...(inside === '' ? {} : { inside }),
    ...(name === '' ? {} : { name }),
    tag: el.tagName.toLowerCase(),
    image: imageOf(el),
    domPath: path.join(' > '),
    selector: selectorOf(el),
    rect: box(el),
    marks,
    levels,
    level: 0
  }
}

/**
 * A reported target with its boxes measured again — after the page scrolled or resized, the same
 * pick where it is now. Nothing but `rect` and each level's `rect` changes: the words, marks and
 * selector are the ones already reported, so a move never says more than the pick did.
 * @param {import('../protocol.mjs').PickTarget} target - what `describe(el)` reported.
 * @param {Element} el - the element it describes.
 * @param {Element[]} levelEls - `levelElements(el)`, the elements behind `target.levels`.
 * @returns {import('../protocol.mjs').PickTarget}
 */
export function reboxed(target, el, levelEls) {
  return {
    ...target,
    rect: box(el),
    levels: target.levels.map((level, i) => (levelEls[i] ? { ...level, rect: box(levelEls[i]) } : level))
  }
}

/** The tracked states of a comment not handed to the agent yet: held by its words, not only its path. */
const WAITING = new Set(['saved', 'pending', 'active'])

/**
 * The element a tracked item still means, or why none does (`pick-lost`'s reason).
 *
 * 🔒 NEVER ANOTHER ELEMENT. A selector is a path, and a path outlives what it pointed at: after a
 * menu is reordered, `li:nth-child(2)` is someone else's item. So a match counts only when it is the
 * ONE element the selector finds (`many` otherwise) and its words still begin with the first
 * `TRACK_LIMITS.match` characters reported when it was picked (`changed` otherwise). An element that
 * had no words is held by the tag its selector ends in; a selector that ends in an id names no tag,
 * and the id, unique when picked, is taken as the element. The picker's own drawings never count.
 *
 * The words (and the tag) are checked only while the comment is still waiting — state `saved`,
 * `pending` or `active`. Once it has gone to the agent (`sent|working|done|failed|asked`) its words
 * are EXPECTED to change — that is the edit the person asked for — so it is held by its selector alone
 * (`missing` / `many` still apply). An item sent again as waiting is checked by its words again.
 * @param {{ selector: string, text: string, state?: string, tag?: string }} item - as `pick-track`
 *   carried it; `tag` (the open pick's, never on the wire) helps find it again by its words.
 * @param {Document} doc
 * @returns {{ el: Element } | { el: null, reason: 'missing' | 'many' | 'changed' }}
 */
export function locate(item, doc) {
  const found = matching(item.selector, doc)
  if (found === null) return { el: null, reason: 'missing' }
  if (found.length !== 1) {
    const again = found.length === 0 ? byWords(item, doc) : null
    return again !== null ? { el: again } : { el: null, reason: found.length === 0 ? 'missing' : 'many' }
  }
  const el = found[0]
  if (item.state !== undefined && !WAITING.has(item.state)) return { el }
  if (item.text === '') {
    const tag = /(?:^|[\s>])([a-zA-Z][\w-]*)(?:[.:][^\s>]*)?$/.exec(item.selector)
    if (tag !== null && tag[1].toLowerCase() !== el.tagName.toLowerCase())
      return { el: null, reason: 'changed' }
  } else if (!ownText(el).startsWith(item.text.slice(0, TRACK_LIMITS.match))) {
    const again = byWords(item, doc)
    return again !== null ? { el: again } : { el: null, reason: 'changed' }
  }
  return { el }
}

/** @param {string} selector @param {Document} doc - its matches (the picker's drawings left out), or null. */
function matching(selector, doc) {
  try {
    return Array.prototype.filter.call(
      doc.querySelectorAll(selector),
      (node) => !isOwn(node) && node.isConnected !== false
    )
  } catch {
    // Not a selector this page can parse: nothing it names can be found.
    return null
  }
}

/**
 * The element a path no longer names, found by its words (runtime 14, acceptance v3 J18): among the
 * elements of the kind the selector's last step names (its tag and classes, not its position), the ONE
 * whose words begin as picked. A page that re-rendered with a sibling before it keeps its comment; two
 * with those words are none — never a guess. Only by words, so only while there are words to go by.
 * @param {{ selector: string, text: string, tag?: string }} item @param {Document} doc
 * @returns {Element | null}
 */
function byWords(item, doc) {
  const start = item.text.slice(0, TRACK_LIMITS.match)
  if (start.trim().length < 3) return null
  // Runtime 16 (acceptance v5 PICK-new-2): a re-render may drop the id too, so the last step goes
  // without it — its tag and classes, else the tag the pick reported, else any element.
  let last = item.selector
    .split(/[\s>]+/)
    .pop()
    .trim()
    .replace(/:nth-child\(\d+\)/g, '')
    .replace(/#[\w-]+/g, '')
  if (last === '' && typeof item.tag === 'string' && /^[a-z][\w-]*$/i.test(item.tag)) last = item.tag
  const kind = matching(last === '' ? '*' : last, doc)
  if (kind === null) return null
  const hits = kind.filter((node) => ownText(node).startsWith(start))
  // A link's words are its heading's too: the innermost element holding them is the one meant.
  const inner = hits.filter((node) => !hits.some((other) => other !== node && holds(node, other)))
  return inner.length === 1 ? inner[0] : null
}

/** @param {Element} outer @param {Element} inner - whether `inner` sits inside `outer`. */
function holds(outer, inner) {
  for (let node = inner.parentElement; node && node.nodeType === 1; node = node.parentElement)
    if (node === outer) return true
  return false
}

/** @param {Element} el - whether a `[data-tracy-private]` subtree holds it: nothing is drawn over it. */
export function isHidden(el) {
  for (let node = el; node && node.nodeType === 1; node = node.parentElement)
    if (node.hasAttribute('data-tracy-private')) return true
  return false
}
