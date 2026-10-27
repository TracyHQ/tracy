/**
 * ONE HTML VOCABULARY for the words a visitor reads on a page of this site (PLAN v2 D3): a small
 * tokenizer, the rendered units the replace job matches against, and the region rules the page
 * outline prints. Pure — no I/O, no DOM.
 *
 * 🔒 WHY ONE MODULE. `page.text {outline:true}` tells the model where words sit (`main h1`, `footer
 * text`), and the replace job (Wave 2) takes the same names back as `where`. Two parsers would drift:
 * the outline would print `header` for a line the replace job files under `main`, and the model
 * would be refused for quoting what it was shown. So both read the units built here, and the region
 * names are the replace job's `where` values — `topbar | header | main | footer | title` — plus
 * `drawer` for off-canvas / drawer / dropdown copies, which the outline prints at the end and which
 * is never a `where` (a mobile menu is a copy of the header's words, not a second place to write).
 *
 * Deliberately not a DOM. It keeps what a rendered page needs and nothing more: the text of each
 * block element, the chain of elements around it, and a map from every character back to the raw
 * bytes it came from, so a match on the normalised text can be spliced into the exact source span.
 * Unusual markup degrades the region label, never the words.
 */

import { TEXT_BLOCK } from './empty-rules.mjs'

/**
 * The named entities a page may carry, as code points — the SAME table `readablePage` decodes with
 * (`site.mjs`), so the outline and the page text never disagree on a letter.
 *
 * 🔒 THE WHOLE LATIN-1 BLOCK, NOT A HANDFUL: an older CMS writes `Xin ch&agrave;o`, and a table of
 * fifteen names returned it undecoded in the middle of the prose (`site.mjs` has the history). The
 * Latin-1 names map to code points 160–255 in order, so they are spelled once. `site.mjs` keeps its
 * own copy until its owner switches it to this export (it is another package's file in this wave);
 * `test/html-units.test.mjs` fails the day the two tables disagree.
 */
const LATIN1 =
  'nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn ' +
  'sup2 sup3 acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave ' +
  'Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ' +
  'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN ' +
  'szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute ' +
  'icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml ' +
  'yacute thorn yuml'

/**
 * The ONE entity table (27/09/2026: `site.mjs` kept a second copy whose pattern `[a-z]+` could not
 * reach a name with a digit — `m&sup2;` stayed literal in page.text while the replace job decoded it,
 * so a quoted `m²` found nothing). Latin-1 above, then the HTML 4 symbols a CMS emits in content.
 * @type {Readonly<Record<string, number>>}
 */
export const NAMED = Object.freeze({
  amp: 38,
  lt: 60,
  gt: 62,
  quot: 34,
  apos: 39,
  hellip: 0x2026,
  mdash: 0x2014,
  ndash: 0x2013,
  lsquo: 0x2018,
  rsquo: 0x2019,
  ldquo: 0x201c,
  rdquo: 0x201d,
  bull: 0x2022,
  dagger: 0x2020,
  trade: 0x2122,
  euro: 0x20ac,
  // HTML 4 punctuation and symbols beyond Latin-1.
  OElig: 0x152,
  oelig: 0x153,
  Scaron: 0x160,
  scaron: 0x161,
  Yuml: 0x178,
  fnof: 0x192,
  circ: 0x2c6,
  tilde: 0x2dc,
  ensp: 0x2002,
  emsp: 0x2003,
  thinsp: 0x2009,
  zwnj: 0x200c,
  zwj: 0x200d,
  lrm: 0x200e,
  rlm: 0x200f,
  sbquo: 0x201a,
  bdquo: 0x201e,
  Dagger: 0x2021,
  permil: 0x2030,
  prime: 0x2032,
  Prime: 0x2033,
  lsaquo: 0x2039,
  rsaquo: 0x203a,
  oline: 0x203e,
  frasl: 0x2044,
  larr: 0x2190,
  uarr: 0x2191,
  rarr: 0x2192,
  darr: 0x2193,
  harr: 0x2194,
  minus: 0x2212,
  infin: 0x221e,
  there4: 0x2234,
  asymp: 0x2248,
  ne: 0x2260,
  le: 0x2264,
  ge: 0x2265,
  loz: 0x25ca,
  spades: 0x2660,
  clubs: 0x2663,
  hearts: 0x2665,
  diams: 0x2666,
  ...Object.fromEntries(LATIN1.split(' ').map((name, i) => [name, 160 + i]))
})

/**
 * One entity body (`amp`, `#233`, `#xE9`) as its text, or null when it is not one this table knows —
 * an unknown entity is LEFT AS WRITTEN by the callers, never dropped: a missing character is
 * invisible to whoever reads the answer, a visible `&fake;` is something someone can report.
 * @param {string} body
 * @returns {string | null}
 */
export function entityText(body) {
  if (body.startsWith('#')) {
    const code =
      body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10)
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : null
  }
  // Exact spelling first: `&Agrave;` and `&agrave;` are different letters.
  const code = NAMED[body] ?? NAMED[body.toLowerCase()]
  return code === undefined ? null : String.fromCodePoint(code)
}

/** One entity at a position (sticky). Names may carry digits: `&sup2;`, `&frac12;`. */
const ENTITY = /&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/y

/**
 * A string with its entities decoded.
 * @param {string} s
 * @returns {string}
 */
export function decodeEntities(s) {
  return String(s ?? '').replace(
    /&(#[0-9]+|#[xX][0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g,
    (whole, body) => entityText(String(body)) ?? whole
  )
}

// ── Normalised views with offsets (F3 §3.2) ────────────────────────────────────────────────────────

/**
 * One source character (or decoded entity) as it reads: every kind of space is one space, every
 * dash one hyphen, curly quotes straight, an ellipsis three dots, and the invisible marks (soft
 * hyphen, zero-width space/joiners, byte-order mark) nothing — so "Mon–Fri" and "Mon-Fri" are the
 * same words to a matcher, as they are to the customer who typed one of them.
 * @param {string} ch
 * @returns {string}
 */
function fold1(ch) {
  if (/[\u00a0\u2000-\u200a\u202f\u205f\u3000\t\n\r\f\v ]/.test(ch)) return ' '
  if (/[\u2010-\u2015\u2212]/.test(ch)) return '-'
  if (/[\u2018\u2019\u201a\u201b\u2032]/.test(ch)) return "'"
  if (/[\u201c\u201d\u201e\u201f\u2033]/.test(ch)) return '"'
  if (ch === '\u2026') return '...'
  if (ch === '\u00ad' || ch === '\u200b' || ch === '\u200c' || ch === '\u200d' || ch === '\ufeff') return ''
  return ch
}

/**
 * A character with its case and accents removed. U+0111 (d with stroke) is not a combining mark, so
 * it is mapped by hand — compared by code point, because the `language` gate reads a string literal's
 * value and would count that letter as Vietnamese text in the code.
 * @param {string} ch
 */
function bare1(ch) {
  const l = ch.toLowerCase()
  if (l.codePointAt(0) === 0x111) return 'd'
  return l.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

/**
 * @typedef {{ c: string, s: number, e: number, h?: boolean, el?: UnitElement | null,
 *   child?: UnitElement | null, a?: UnitElement | null, soft?: boolean, br?: boolean }} Atom
 *   One source character (or a decoded entity, or a soft space at an inline edge) and its raw span.
 *   `h`: inside a hidden element. `el`: the innermost open element. `child`: the inline element that
 *   is a direct child of the unit's block (null for words written in the block itself). `a`: the
 *   nearest open link.
 */

/**
 * Normalised views of `raw` (or of `atoms`, when a caller already cut it into characters): `cased`
 * (folded, spaces collapsed and trimmed), `lower` (same length), `bare` (no case, no accents), each
 * index mapped back to the raw `[start, end)` it came from — so a match on a view is spliced into the
 * exact raw bytes.
 * @param {string} raw
 * @param {{ decode?: boolean, lo?: number, hi?: number, atoms?: Atom[] | null }} [options]
 * @returns {{ cased: string, lower: string, map: [number, number][], bare: string, bmap: [number, number][] }}
 */
export function views(raw, { decode = true, lo = 0, hi = raw.length, atoms = null } = {}) {
  /** @type {Atom[]} */
  const src = atoms ?? []
  if (!atoms) {
    let i = lo
    while (i < hi) {
      if (decode && raw[i] === '&') {
        ENTITY.lastIndex = i
        const m = ENTITY.exec(raw)
        const c = m ? entityText(m[1]) : null
        if (m && c !== null) {
          src.push({ c, s: i, e: i + m[0].length })
          i += m[0].length
          continue
        }
      }
      const cp = /** @type {number} */ (raw.codePointAt(i))
      const len = cp > 0xffff ? 2 : 1
      src.push({ c: raw.slice(i, i + len), s: i, e: i + len })
      i += len
    }
  }
  // 🔒 PIECES IN ARRAYS, JOINED ONCE — NEVER `s += c` THEN `s.endsWith(' ')`. A string grown one
  // character at a time is a rope, and `endsWith` on a rope flattens it: one unit of 200,000 inline
  // spans (2.9 MB) took 20 s here, 4.4 s of it in this function, against ~0.1 s now.
  /** @type {string[]} */
  const cased = []
  /** @type {string[]} */
  const lower = []
  /** @type {[number, number][]} */
  const map = []
  /** @type {string[]} */
  const bare = []
  /** @type {[number, number][]} */
  const bmap = []
  let space = true // the start counts as a space: leading spaces are dropped
  for (const a of src) {
    for (const g of fold1(a.c)) {
      if (g === ' ' && space) continue
      space = g === ' '
      cased.push(g)
      const l = g.toLowerCase()
      lower.push(l.length === g.length ? l : g)
      for (let k = 0; k < g.length; k += 1) map.push([a.s, a.e])
      const b = g === ' ' ? ' ' : bare1(g)
      for (const bc of b) {
        bare.push(bc)
        bmap.push([a.s, a.e])
      }
    }
  }
  // Trailing spaces off. A ' ' piece is one UTF-16 unit with one map entry, so a pop keeps the two
  // aligned (`bare` and `bmap` get one entry per code point, as before).
  while (cased.length > 0 && cased[cased.length - 1] === ' ') {
    cased.pop()
    lower.pop()
    map.pop()
  }
  while (bare.length > 0 && bare[bare.length - 1] === ' ') {
    bare.pop()
    bmap.pop()
  }
  return { cased: cased.join(''), lower: lower.join(''), map, bare: bare.join(''), bmap }
}

/**
 * Text folded the way the matcher reads it (spaces, dashes, quotes, invisible marks) and lowercased,
 * without the offset maps — for a filter that only asks "does this line carry those words".
 * @param {unknown} s
 * @returns {string}
 */
export function foldForMatch(s) {
  /** @type {string[]} */
  const out = []
  let space = true
  for (const ch of String(s ?? '')) {
    const g = fold1(ch)
    if (g === '' || (g === ' ' && space)) continue // an invisible mark changes nothing
    space = g === ' '
    out.push(g)
  }
  return out.join('').trimEnd().toLowerCase()
}

// ── The tokenizer and the rendered units (F3 §3.4) ─────────────────────────────────────────────────

/** Elements whose contents are never words a visitor reads. */
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe'])
/** Elements that start a new run of text (`empty-rules.mjs`, shared with the residue sweep). */
const BLOCK = TEXT_BLOCK
const VOID = new Set('br img hr input wbr source meta link area col embed param track'.split(' '))
/**
 * The deepest the element stack goes. The 42 saved ja-business pages (WordPress, Joomla, EmDash)
 * reach 7–24; page builders nest ~40. Past it the innermost element is closed first, so the outer
 * elements — the ones a region is read from — stay.
 */
const MAX_DEPTH = 128

/** @param {number} c - a char code: the five HTML whitespace characters. */
const isSpaceCode = (c) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13
/** @param {number} c */
const isAsciiLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122)

/**
 * @typedef {{ kind: 'tag', close: boolean, name: string, attrs: Record<string, string>,
 *   selfClosed: boolean, end: number } | { kind: 'skip', end: number } | { kind: 'text' }} Markup
 *   What a `<` starts: a tag (`end` just past its `>`), something no visitor reads (a comment, a
 *   declaration, a bogus comment — `end` past it, or the document's end), or a `<` that is a letter.
 */

/**
 * What starts at the `<` at `i` — the WHATWG tokenizer's tag states, reduced to what the units need:
 * a start or end tag runs to the first `>` outside a quoted attribute value; `<!--` to `-->`;
 * `<!…>`, `<?…>` and `</` + a non-letter are bogus comments to the next `>`; a `<` before anything
 * but a letter is a letter itself.
 *
 * 🔒 ONE PASS, NEVER A RETRY — the parse is LINEAR. The first version matched each `<` against a
 * regex that could scan to the end of the document and, on failure, read that `<` as a letter and
 * tried again from the next one. On `'<a"'.repeat(n)` that is quadratic: 0.8 s at 30 KB, 8.9 s at
 * 120 KB, and the read accepts 4 MiB — hours of one dsh event loop every site on the host shares
 * (ADR 0014: one dsh per host). So, as a browser does, a tag or comment still open at the end of
 * the document swallows the rest (`end` = its length): what a visitor reads, and one scan.
 * Attribute values are kept raw (entities undecoded); a repeated attribute keeps its FIRST value.
 * @param {string} src
 * @param {number} i - the index of a `<`.
 * @returns {Markup}
 */
export function markupAt(src, i) {
  const n = src.length
  if (src.startsWith('<!--', i)) {
    // `<!-->` and `<!--->` are whole (empty) comments, as a browser reads them
    const j = src.indexOf('-->', i + 2)
    return { kind: 'skip', end: j === -1 ? n : j + 3 }
  }
  if (src.startsWith('<![CDATA[', i)) {
    const j = src.indexOf(']]>', i + 9)
    return { kind: 'skip', end: j === -1 ? n : j + 3 }
  }
  const c1 = src.charCodeAt(i + 1)
  const close = c1 === 47
  if (c1 === 33 || c1 === 63 || (close && !isAsciiLetter(src.charCodeAt(i + 2)))) {
    const j = src.indexOf('>', i + 2)
    return { kind: 'skip', end: j === -1 ? n : j + 1 }
  }
  const at = close ? i + 2 : i + 1
  if (!isAsciiLetter(src.charCodeAt(at))) return { kind: 'text' }
  let j = at + 1
  while (j < n) {
    const c = src.charCodeAt(j)
    if (isSpaceCode(c) || c === 47 || c === 62) break
    j += 1
  }
  const name = src.slice(at, j).toLowerCase()
  /** @type {Record<string, string>} */
  const attrs = Object.create(null)
  let selfClosed = false
  for (;;) {
    while (j < n && isSpaceCode(src.charCodeAt(j))) j += 1
    if (j >= n) return { kind: 'skip', end: n }
    let c = src.charCodeAt(j)
    if (c === 62) {
      j += 1
      break
    }
    if (c === 47) {
      j += 1
      if (src.charCodeAt(j) === 62) {
        selfClosed = true
        j += 1
        break
      }
      continue
    }
    // an attribute name: up to a space, `/`, `>` or `=` (its first character may be any of the rest)
    const ns = j
    j += 1
    while (j < n) {
      c = src.charCodeAt(j)
      if (isSpaceCode(c) || c === 47 || c === 62 || c === 61) break
      j += 1
    }
    const key = src.slice(ns, j).toLowerCase()
    while (j < n && isSpaceCode(src.charCodeAt(j))) j += 1
    let value = ''
    if (src.charCodeAt(j) === 61) {
      j += 1
      while (j < n && isSpaceCode(src.charCodeAt(j))) j += 1
      c = src.charCodeAt(j)
      if (c === 34 || c === 39) {
        const q = src.indexOf(src[j], j + 1)
        if (q === -1) return { kind: 'skip', end: n }
        value = src.slice(j + 1, q)
        j = q + 1
      } else {
        const vs = j
        while (j < n) {
          c = src.charCodeAt(j)
          if (isSpaceCode(c) || c === 62) break
          j += 1
        }
        value = src.slice(vs, j)
      }
    }
    if (!(key in attrs)) attrs[key] = value
  }
  return { kind: 'tag', close, name, attrs, selfClosed, end: j }
}

/**
 * Where the raw text of `<name>` (a script, a style) ends: the next `</name` followed by a space,
 * `/`, `>` or the end — compared without lowercasing the document, whose length a lowercase can
 * change (`İ` lowercases to two code units) and so shift every offset after it. -1 when it never
 * closes. Exported for `page-head.mjs`, whose JSON-LD lives in exactly such a body.
 * @param {string} src
 * @param {number} from
 * @param {string} name - lowercase.
 */
export function rawTextEnd(src, from, name) {
  let k = src.indexOf('</', from)
  while (k !== -1) {
    const after = k + 2 + name.length
    if (src.slice(k + 2, after).toLowerCase() === name) {
      const c = src.charCodeAt(after)
      if (Number.isNaN(c) || isSpaceCode(c) || c === 47 || c === 62) return k
    }
    k = src.indexOf('</', k + 2)
  }
  return -1
}

/**
 * Classes that take an element out of what a visitor reads. `not-sr-only` (Tailwind's
 * `md:not-sr-only`) puts it back: the EmDash language button's "English" is `sr-only
 * md:not-sr-only`, visible on every desktop.
 */
const HIDE_CLASS = /(^|\s)(screen-reader-text|sr-only|visually-hidden|skip-link)(\s|$)/i
const SHOW_CLASS = /(^|[\s:])not-sr-only(\s|$)/i

/**
 * @typedef {{ tag: string, id: string, cls: string, data: string, role: string, inline: boolean,
 *   hide: boolean, open: boolean, href: string | null }} UnitElement
 *   One open element as the units see it. `hide`: the `hidden` attribute, `aria-hidden="true"`, or a
 *   screen-reader-only class. `href`: a link's raw target, entities decoded.
 */

/**
 * The picture an element's own inline style paints behind it (`style="background-image:url(bg-2.jpg)"`), or null.
 * A T3 masthead, a slider's slide, a hero band: the picture a visitor sees first is often no `<img>` at all
 * (the design-system ladder's JA Mood, 15/10/2026: its top picture was only a background, so the agent took the
 * one `<img>` it could see, a lower picture, and asked).
 * @param {string | undefined} style
 */
function backgroundOf(style) {
  const m = /background(?:-image)?\s*:[^;]*?url\(\s*(['"]?)([^'")]+)\1\s*\)/i.exec(String(style ?? ''))
  const src = m?.[2]?.trim() ?? ''
  return src === '' || /^data:/i.test(src) ? null : src
}

/**
 * @param {string} tag
 * @param {Record<string, string>} a
 * @param {boolean} inline
 * @returns {UnitElement}
 */
function elementOf(tag, a, inline) {
  const cls = a.class ?? ''
  const hide =
    'hidden' in a ||
    String(a['aria-hidden'] ?? '').toLowerCase() === 'true' ||
    (HIDE_CLASS.test(cls) && !SHOW_CLASS.test(cls))
  return {
    tag,
    id: a.id ?? '',
    cls,
    data: a['data-id'] ?? '',
    role: String(a.role ?? '').toLowerCase(),
    inline,
    hide,
    open: 'open' in a,
    href: tag === 'a' && typeof a.href === 'string' ? decodeEntities(a.href) : null
  }
}

/** @typedef {'topbar' | 'header' | 'main' | 'footer' | 'title' | 'drawer'} Region */

/** The region names the replace job takes as `where` — `drawer` is printed, never a `where`. */
export const WHERE_REGIONS = Object.freeze(['topbar', 'header', 'main', 'footer', 'title'])

/**
 * Off-canvas panels, drawers and dropdown menus: copies of words shown elsewhere, or panels shown
 * only on a click. Token-bounded so `dropdown-toggle` (the visible trigger, Joomla "Resources") is
 * NOT one, while `dropdown-menu` (its panel) is; and not WordPress's
 * `wp-block-navigation__responsive-container`, which holds the header menu on every desktop.
 */
const DRAWER_TOKEN = /(^|[\s_-])(offcanvas|off-canvas|drawer|dropdown-menu|submenu|sub-menu)([\s_-]|$)/
const TOPBAR_TOKEN = /(^|[\s_-])(topbar|top-bar)([\s_-]|$)/
const CRUMB_TOKEN = /breadcrumb|crumbs/
const LANDMARK_TOKEN = /(^|[\s_-])(header|footer|main)([\s_-]|$)/
const SECTIONING = new Set(['section', 'article', 'aside'])

/** @param {UnitElement} el */
const idc = (el) => `${el.id} ${el.cls}`.toLowerCase()

/**
 * The region of a chain of elements (innermost first), by D3:
 * - inside `<title>` → `title`; a breadcrumb → `title`;
 * - inside an off-canvas / drawer / dropdown panel, or a closed `<dialog>` (a language picker, a
 *   modal) → `drawer`;
 * - inside a top bar (`topbar`/`top-bar` token) → `topbar`;
 * - else the OUTERMOST landmark decides: `<header>`, `<footer>`, `<main>`, their roles
 *   (`banner`, `contentinfo`, `main`), or an id/class token `header|footer|main` — except the token
 *   of a PAGE WRAPPER (`wrappers`, {@link pageWrappers}).
 *
 * 🔒 A HEADER INSIDE A SECTION IS A SECTION'S HEAD, NOT THE PAGE HEADER. Joomla's tracy-business
 * opens `header.tb-section__head` inside every band of the home page, and it has no `<main>` at all;
 * reading the tag alone filed every band title under `header`. So once a `<section>`, `<article>` or
 * `<aside>` has been passed on the way in, a header/footer tag or token no longer counts. With no
 * landmark at all the words are `main` — a page's body is where unlabelled words live.
 * @param {readonly UnitElement[]} chain - ancestors, innermost first.
 * @param {ReadonlySet<UnitElement>} [wrappers] - elements whose token does not count.
 * @returns {Region}
 */
export function regionOf(chain, wrappers = NO_WRAPPERS) {
  return landmarkOf(chain, wrappers) ?? 'main'
}

/** @type {ReadonlySet<UnitElement>} */
const NO_WRAPPERS = new Set()

/**
 * {@link regionOf} without its default: null when nothing in the chain names a region.
 * @param {readonly UnitElement[]} chain
 * @param {ReadonlySet<UnitElement>} wrappers
 * @returns {Region | null}
 */
function landmarkOf(chain, wrappers) {
  if (chain.some((el) => el.tag === 'title')) return 'title'
  if (chain.some((el) => (el.tag === 'dialog' && !el.open) || DRAWER_TOKEN.test(idc(el)))) return 'drawer'
  if (chain.some((el) => CRUMB_TOKEN.test(idc(el)))) return 'title'
  if (chain.some((el) => TOPBAR_TOKEN.test(idc(el)))) return 'topbar'
  let sectioned = false
  for (let k = chain.length - 1; k >= 0; k -= 1) {
    const el = chain[k]
    if (el.tag === 'body' || el.tag === 'html') continue
    if (el.tag === 'main' || el.role === 'main') return 'main'
    if (!sectioned) {
      if (el.tag === 'header' || el.role === 'banner') return 'header'
      if (el.tag === 'footer' || el.role === 'contentinfo') return 'footer'
    }
    if (SECTIONING.has(el.tag)) {
      sectioned = true
      continue
    }
    if (!sectioned && !wrappers.has(el)) {
      const m = LANDMARK_TOKEN.exec(idc(el))
      if (m) return /** @type {Region} */ (m[2])
    }
  }
  return null
}

/**
 * The elements whose `header|footer|main` token names the whole page, not a region of it: a token
 * element that holds page landmark TAGS (or roles) of more than one kind.
 *
 * 🔒 WHY A WRAPPER'S TOKEN IS DROPPED, AND ONLY A WRAPPER'S. `div.main-wrapper` / `#main-container`
 * around `<header>`, `<main>` and `<footer>` is the outermost element of every word on the page, and
 * while its token counted it filed the header and footer under `main`: the logo and the copyright
 * left the outline, and `where:"footer"` would find nothing. But "a tag always outranks a token" is
 * wrong the other way on this product's own template: Joomla tracy-business puts the contact and
 * news pages' intro in `header.tb-pageintro` INSIDE `div#t4-main-body.t4-main-body` — the page's
 * `h1`, which that rule filed under `header` (measured on the saved contact and news pages). A region
 * holds landmarks of one kind at most; a wrapper holds several — that is the line.
 * @param {readonly { chain: readonly UnitElement[] }[]} units
 * @returns {Set<UnitElement>}
 */
export function pageWrappers(units) {
  /** @type {Map<UnitElement, number>} a bit per landmark kind held: 1 header, 2 main, 4 footer */
  const held = new Map()
  /** @type {Set<UnitElement>} */
  const out = new Set()
  for (const { chain } of units) {
    // the INNERMOST page landmark tag of each kind: every element outside it holds that kind
    let header = -1
    let main = -1
    let footer = -1
    let sectioned = false
    for (let k = chain.length - 1; k >= 0; k -= 1) {
      const el = chain[k]
      if (el.tag === 'main' || el.role === 'main') main = k
      else if (!sectioned && (el.tag === 'header' || el.role === 'banner')) header = k
      else if (!sectioned && (el.tag === 'footer' || el.role === 'contentinfo')) footer = k
      if (SECTIONING.has(el.tag)) sectioned = true
    }
    if (header === -1 && main === -1 && footer === -1) continue
    for (let o = chain.length - 1; o > 0; o -= 1) {
      const el = chain[o]
      const bits =
        (o > header && header !== -1 ? 1 : 0) |
        (o > main && main !== -1 ? 2 : 0) |
        (o > footer && footer !== -1 ? 4 : 0)
      if (bits === 0) break // nothing inside this element (or any inside it) is a landmark tag
      if (!LANDMARK_TOKEN.test(idc(el))) continue
      const all = (held.get(el) ?? 0) | bits
      held.set(el, all)
      if (all !== 1 && all !== 2 && all !== 4) out.add(el)
    }
  }
  return out
}

/**
 * Is this element a navigation: `<nav>`, `role="navigation"`, or a class named exactly `nav`,
 * `navbar`, `menu` or `wp-block-navigation`?
 * @param {UnitElement} el
 */
export function isNavElement(el) {
  return (
    el.tag === 'nav' ||
    el.role === 'navigation' ||
    /(^|\s)(nav|navbar|menu|wp-block-navigation)(\s|$)/.test(el.cls)
  )
}

/**
 * @typedef {{ cased: string, lower: string, map: [number, number][], bare: string, bmap: [number, number][],
 *   chain: UnitElement[], chainAt: (k: number) => UnitElement[], region: Region, inNav: boolean,
 *   inForm: boolean, inTitle: boolean, hidden: boolean, shown: string, breaks: number, atoms: Atom[],
 *   attr?: 'alt' | 'placeholder' }} RenderedUnit
 *   One run of text inside one block element. `cased`/`lower`/`bare` and their maps cover EVERY
 *   character, hidden ones included (the replace job decides what to do with them); `shown` is the
 *   visible text as the page writes it (spaces collapsed, punctuation kept); `hidden` is true when
 *   nothing of it is visible; `breaks` counts the `<br>` that split its words into lines.
 */

/**
 * @typedef {{ src: string, alt: string, chain: UnitElement[], background?: true }} PagePicture
 *   One `<img>` of the page (not one inside `script`, `noscript`, `template` or `svg`), its `src` (or a lazy
 *   loader's `data-src`) and `alt` decoded, and its ancestors, innermost first — the same element objects the
 *   units' chains hold, so a unit and a picture share a card by identity.
 */

/**
 * The words a visitor reads on one page, as units: one run of text inside one block element
 * (inline tags do not split it; each inline edge is a soft space; `<br>` is a space and is counted).
 * `script style noscript template svg iframe` are skipped; `alt` and `placeholder` attributes are
 * extra units (`attr` set). Each unit keeps its ancestor chain (innermost first), `chainAt(k)` — the
 * chain in force at view index k, since one unit can hold a title span and a caption span (the Joomla
 * mega menu's "Newsletter Digest email template") — its region, whether it sits in a navigation or a
 * form, and the page's `<html lang>` and `<body class>` come back beside the units.
 * @param {unknown} html
 * @returns {{ units: RenderedUnit[], lang: string | null, body: string, images: PagePicture[] }}
 */
export function renderedUnits(html) {
  const src = typeof html === 'string' ? html : ''
  /** @type {RenderedUnit[]} */
  const units = []
  /** @type {PagePicture[]} */
  const images = []
  /** @type {UnitElement[]} */
  const stack = []
  /** @type {Atom[]} */
  let atoms = []
  /** @type {UnitElement[] | null} */
  let chainAtStart = null
  /** @type {[number, UnitElement[]][]} the element chain in force from that raw offset on */
  let segs = []
  /** @type {UnitElement | null} */
  let top = null
  /** @type {UnitElement | null} */
  let anchor = null
  /** @type {UnitElement | null} */
  let child = null
  let hidden = false
  /** has a visible character (not only spaces) joined the run since the last flush? */
  let words = false
  /**
   * Per open element, what `refresh` needs from the elements below it — so a push or a pop costs
   * O(1), not a walk of the whole stack (a page of 100,000 nested inline tags walked it 100,000
   * times).
   * `chain`: the stack up to this element, innermost first, built once when first asked — every
   * unit and every inline edge at the same depth shares ONE array.
   * @type {{ anchor: UnitElement | null, hidden: boolean, block: number, chain: UnitElement[] | null }[]}
   */
  const below = []
  /** @type {UnitElement[]} */
  const EMPTY = []
  const chainNow = () => {
    const k = stack.length - 1
    if (k < 0) return EMPTY
    const level = below[k]
    if (level.chain === null) level.chain = [...stack].reverse()
    return level.chain
  }
  const refresh = () => {
    const k = stack.length - 1
    top = k >= 0 ? stack[k] : null
    anchor = k >= 0 ? below[k].anchor : null
    hidden = k >= 0 ? below[k].hidden : false
    const block = k >= 0 ? below[k].block : -1
    child = block + 1 < stack.length ? stack[block + 1] : null
  }
  /**
   * One element opened. 🔒 THE STACK STOPS AT {@link MAX_DEPTH}: past it the innermost element is
   * closed first, so a crafted page of endless unclosed tags costs each tag a bounded chain, not one
   * the size of the page (measured before the cap: 160,000 nested `<i>` held 82 M chain entries).
   * @param {UnitElement} el
   */
  const open = (el) => {
    if (stack.length >= MAX_DEPTH) {
      stack.pop()
      below.pop()
    }
    const k = stack.length - 1
    const prev = k >= 0 ? below[k] : { anchor: null, hidden: false, block: -1, chain: null }
    stack.push(el)
    below.push({
      anchor: el.tag === 'a' ? el : prev.anchor,
      hidden: prev.hidden || el.hide,
      block: el.inline ? prev.block : stack.length - 1,
      chain: null
    })
    refresh()
  }
  /** @param {string} tag */
  const popTo = (tag) => {
    for (let k = stack.length - 1; k >= 0; k -= 1)
      if (stack[k].tag === tag) {
        stack.length = k
        below.length = k
        refresh()
        return true
      }
    return false
  }
  const flush = () => {
    if (atoms.length > 0) {
      const v = views(src, { atoms })
      if (/[\p{L}\p{N}]/u.test(v.cased)) {
        const chain = chainAtStart ?? chainNow()
        const own = segs
        /** @param {number} k */
        const chainAt = (k) => {
          const raw = v.map[k]?.[0] ?? 0
          let c = chain
          for (const [off, ch] of own) if (off <= raw) c = ch
          return c
        }
        const shown = shownText(atoms)
        units.push({
          ...v,
          chain,
          chainAt,
          region: 'main', // set once the whole page is read: a wrapper is known only then
          inNav: chain.some(isNavElement),
          inForm: chain.some((el) => el.tag === 'form'),
          inTitle: chain.some((el) => el.tag === 'title'),
          hidden: !/[\p{L}\p{N}]/u.test(shown),
          shown,
          breaks: breaksOf(atoms),
          atoms
        })
      }
    }
    atoms = []
    chainAtStart = null
    segs = []
    words = false
  }
  let i = 0
  const n = src.length
  /** @type {string | null} */
  let lang = null
  /** @type {string | null} */
  let body = null
  while (i < n) {
    if (src.charCodeAt(i) === 60) {
      const t = markupAt(src, i)
      // a comment, `<!DOCTYPE html>`, `<?xml …?>`: not words
      if (t.kind === 'skip') {
        i = t.end
        continue
      }
      if (t.kind === 'tag') {
        const { close, selfClosed } = t
        const tag = t.name
        const a = t.attrs
        const tagEnd = t.end
        if (!close && tag === 'html' && lang === null && a.lang)
          lang = /^[^"'\s>]+/.exec(a.lang.trim())?.[0] ?? null
        if (!close && tag === 'body' && body === null && a.class !== undefined) body = a.class
        if (SKIP.has(tag)) {
          if (!close && !selfClosed) {
            const end = rawTextEnd(src, tagEnd, tag)
            i = end === -1 ? n : end
            continue
          }
          i = tagEnd
          continue
        }
        // Every picture with its ancestors (`picturesNear`, page.mjs): what a card shows beside its words.
        // A picture inside an aria-hidden link is the card's own picture, so `hide` is not read here.
        if (!close && tag === 'img') {
          const at = (a.src ?? a['data-src'] ?? '').trim()
          if (at !== '' && !/^data:/i.test(at))
            images.push({
              src: decodeEntities(at),
              alt: decodeEntities(a.alt ?? '')
                .replace(/\s+/g, ' ')
                .trim(),
              chain: chainNow()
            })
        }
        if (!close && (a.placeholder || a.alt)) {
          const self = elementOf(tag, a, !BLOCK.has(tag))
          for (const key of /** @type {const} */ (['placeholder', 'alt'])) {
            const value = a[key]
            if (!value || !value.trim()) continue
            const v = views(value)
            const chain = [self, ...chainNow()]
            const visible =
              !chain.some((el) => el.hide) && !(tag === 'input' && /^hidden$/i.test(a.type ?? ''))
            units.push({
              ...v,
              map: [],
              bmap: [],
              chain,
              chainAt: () => chain,
              region: 'main', // set below, as for the text units
              inNav: chain.some(isNavElement),
              inForm: chain.some((el) => el.tag === 'form'),
              inTitle: false,
              hidden: !visible,
              shown: decodeEntities(value).replace(/\s+/g, ' ').trim(),
              breaks: 0,
              atoms: [],
              attr: key
            })
          }
        }
        if (tag === 'br') {
          atoms.push({ c: ' ', s: i, e: tagEnd, br: true, h: hidden })
        } else if (BLOCK.has(tag)) {
          flush()
          if (close) popTo(tag)
          else if (!VOID.has(tag) && !selfClosed) {
            open(elementOf(tag, a, false))
            // a picture this element's own style paints, under it as an <img> would be (its words share it)
            const bg = a.style === undefined ? null : backgroundOf(decodeEntities(a.style))
            if (bg !== null) images.push({ src: bg, alt: '', chain: chainNow(), background: true })
          }
        } else {
          // inline: a soft space at each edge (a `<span class="block">` beside another must not glue
          // two words into one); the run of text goes on.
          atoms.push({ c: ' ', s: i, e: i, soft: true, h: hidden })
          if (!close && !VOID.has(tag) && !selfClosed) {
            if (!words) chainAtStart = null
            open(elementOf(tag, a, true))
            segs.push([tagEnd, chainNow()])
          } else if (close) {
            popTo(tag)
            segs.push([tagEnd, chainNow()])
          }
        }
        i = tagEnd
        continue
      }
    }
    if (chainAtStart === null && src[i].trim()) chainAtStart = chainNow()
    if (src[i] === '&') {
      ENTITY.lastIndex = i
      const m = ENTITY.exec(src)
      const c = m ? entityText(m[1]) : null
      if (m && c !== null) {
        atoms.push({ c, s: i, e: i + m[0].length, h: hidden, el: top, child, a: anchor })
        if (c.trim()) words = true
        i += m[0].length
        continue
      }
    }
    const cp = /** @type {number} */ (src.codePointAt(i))
    const len = cp > 0xffff ? 2 : 1
    const c = src.slice(i, i + len)
    atoms.push({ c, s: i, e: i + len, h: hidden, el: top, child, a: anchor })
    if (c.trim()) words = true
    i += len
  }
  flush()
  const wrappers = pageWrappers(units)
  /** @type {(Region | null)[]} */
  const landmarks = units.map((u) => landmarkOf(u.chain, wrappers))
  let firstLandmark = -1
  units.forEach((u, k) => {
    const landmark = landmarks[k]
    u.region = landmark ?? 'main'
    if (
      firstLandmark === -1 &&
      u.attr === undefined &&
      (landmark === 'header' || landmark === 'main' || landmark === 'footer')
    )
      firstLandmark = k
  })
  // 🔒 WORDS BEFORE THE FIRST PAGE LANDMARK ARE THE TOP BAR. EmDash's tracy-business writes its top
  // bar as a plain `div.bg-forest` before `<header>`: only its left half carries a `topbar` token, so
  // the language and theme buttons on its right read as `main` and the outline filed them before the
  // logo as if they were body text. On a page with a header, main or footer, the unlabelled words
  // above the first one are the bar above the header; on a page with none, nothing is moved.
  if (firstLandmark > 0)
    for (let k = 0; k < firstLandmark; k += 1) if (landmarks[k] === null) units[k].region = 'topbar'
  return { units, lang, body: body ?? '', images }
}

// ── A page a regex reader can read in linear time ──────────────────────────────────────────────────

/** Elements both page readers drop whole: their bodies are emptied here. */
const DROPPED_BODY = new Set(['script', 'style', 'noscript', 'template', 'svg'])
/** Elements whose body a browser reads as text, not markup (RCDATA). */
const RCDATA = new Set(['title', 'textarea'])

/**
 * One tag written back in a shape nothing downstream can misread: lowercase name, every attribute
 * double-quoted with `"`, `<` and `>` inside it escaped, and names that are not names dropped.
 * @param {{ close: boolean, name: string, attrs: Record<string, string>, selfClosed: boolean }} t
 */
function tagText(t) {
  const name = t.name.replace(/[^a-z0-9:_.-]/g, '-')
  if (t.close) return `</${name}>`
  let attrs = ''
  for (const [key, value] of Object.entries(t.attrs)) {
    if (!/^[a-z_:][a-z0-9_:.-]*$/.test(key)) continue
    attrs += ` ${key}="${value.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`
  }
  return `<${name}${attrs}${t.selfClosed ? ' /' : ''}>`
}

/**
 * The page written again, in ONE linear pass, so that a regex reader of it is linear too — the words
 * a visitor reads unchanged:
 * - comments, `<!DOCTYPE>`, `<?xml?>` and bogus comments go; so does a tag or comment still open at
 *   the end of the document (a browser drops it, and the rest with it);
 * - a `<` that starts no tag becomes `&lt;` (it reads the same once decoded);
 * - `script style noscript template svg` keep their tags and lose their bodies, closed as
 *   `</name>` exactly; `title` and `textarea` keep their text, `<` escaped, closed the same way;
 * - every tag is written by {@link tagText}; a second `<head>` (which a browser ignores) goes.
 *
 * 🔒 WHY, MEASURED. `readablePage` (site.mjs) strips tags with regexes that, from a `<` that never
 * closes, scan to the end of the document and fail — then try again from the next `<`. On
 * `'<p>x</p>' + '<a"'.repeat(n)` that took 0.2 s at 30 KB, 0.7 s at 60 KB and 2.9 s at 120 KB, and a
 * read accepts 4 MiB: one crafted page (an agent or an editor can write one) would hold the one dsh
 * event loop every site on the host shares for hours. On this output every `<` opens a tag that
 * closes, every quote inside a tag is escaped, and every dropped element is closed exactly as that
 * reader looks for it, so each of its patterns either matches or fails at once.
 * @param {unknown} html
 * @returns {string}
 */
export function tameMarkup(html) {
  const src = typeof html === 'string' ? html : ''
  const n = src.length
  /** @type {string[]} */
  const out = []
  let heads = 0
  let i = 0
  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      out.push(src.slice(i))
      break
    }
    if (lt > i) out.push(src.slice(i, lt))
    const t = markupAt(src, lt)
    if (t.kind === 'text') {
      out.push('&lt;')
      i = lt + 1
      continue
    }
    if (t.kind === 'skip') {
      i = t.end
      continue
    }
    i = t.end
    if (!t.close && t.name === 'head' && (heads += 1) > 1) continue
    out.push(tagText(t))
    if (t.close || t.selfClosed || !(DROPPED_BODY.has(t.name) || RCDATA.has(t.name))) continue
    const end = rawTextEnd(src, i, t.name)
    const stop = end === -1 ? n : end
    if (RCDATA.has(t.name)) out.push(src.slice(i, stop).replace(/</g, '&lt;'))
    out.push(`</${t.name}>`)
    if (end === -1) i = n
    else {
      const c = markupAt(src, end)
      i = c.kind === 'text' ? end + 1 : c.end
    }
  }
  return out.join('')
}

/** Every kind of space a page writes, collapsed to one; the invisible marks removed. */
const SPACES = /[\s\u00a0\u2000-\u200a\u202f\u205f\u3000]+/g
const INVISIBLE = /[\u00ad\u200b-\u200d\ufeff]/g

/**
 * The visible text of some atoms as the page writes it: hidden atoms dropped, spaces collapsed,
 * punctuation KEPT (a customer quoting "Mon–Fri" quotes the en dash the page shows).
 * @param {readonly Atom[]} atoms
 */
function shownText(atoms) {
  let s = ''
  for (const a of atoms) if (!a.h) s += a.c
  return s.replace(INVISIBLE, '').replace(SPACES, ' ').trim()
}

/**
 * How many `<br>` split visible words: `Furniture built to fit<br><em>your exact space</em>` is 1 (the
 * heading reads on two lines). A break before the first or after the last word, or a second break in
 * a row, splits nothing.
 * @param {readonly Atom[]} atoms
 */
function breaksOf(atoms) {
  let seen = false
  let pending = false
  let breaks = 0
  for (const a of atoms) {
    if (a.h) continue
    if (a.br) {
      if (seen) pending = true
    } else if (/[\p{L}\p{N}]/u.test(a.c)) {
      if (pending) breaks += 1
      pending = false
      seen = true
    }
  }
  return breaks
}

/**
 * The visible text of a unit cut where its innermost element changes, each piece whitespace-collapsed
 * — "Northgate" and "Industrial infrastructure" out of one Joomla logo link, instead of one run that
 * reads as a single name.
 * @param {RenderedUnit} unit
 * @returns {string[]}
 */
export function unitRuns(unit) {
  /** @type {string[]} */
  const runs = []
  let cur = ''
  /** @type {UnitElement | null | undefined} */
  let el
  const end = () => {
    const t = cur.replace(INVISIBLE, '').replace(SPACES, ' ').trim()
    if (/[\p{L}\p{N}]/u.test(t) && runs[runs.length - 1] !== t) runs.push(t)
    cur = ''
  }
  for (const a of unit.atoms) {
    if (a.h) continue
    if (a.soft || a.br) {
      end()
      continue
    }
    if (a.el !== el && a.c.trim() !== '') {
      end()
      el = a.el
    }
    cur += a.c
  }
  end()
  return runs
}

/**
 * The link a unit's words sit in: the nearest `<a>` open where its first visible word starts, else the
 * first link any visible character of it sits in. Null when it carries none.
 * @param {RenderedUnit} unit
 * @returns {UnitElement | null}
 */
export function unitLink(unit) {
  for (const a of unit.atoms) if (!a.h && a.a && /[\p{L}\p{N}]/u.test(a.c)) return a.a
  const fromChain = unit.chain.find((el) => el.tag === 'a')
  return fromChain ?? null
}

/**
 * A unit that is only a ROW of inline elements, cut into them: `<nav><a>Home</a><a>About</a></nav>`,
 * two buttons side by side, a footer column of `<span>`s — each part with its own link. Any other unit
 * is one part.
 *
 * 🔒 WHY ONLY A ROW. Without CSS a flex row of links is one run of text, so the EmDash home read
 * `header nav: Home About Services Projects News Contact [/]` and `main button: See our work Visit the
 * workshop [/services]` — six links as one, with the first one's target. But a sentence with a link
 * in it (`Call <a>us</a> today`) must stay one sentence. The line between them: every visible word
 * sits inside an inline child of the block, and there are at least two such children. Words written
 * in the block itself mean prose, and prose is not cut.
 * @param {RenderedUnit} unit
 * @returns {{ text: string, link: UnitElement | null }[]}
 */
export function unitParts(unit) {
  /** @type {Map<UnitElement, Atom[]>} */
  const byChild = new Map()
  let loose = false
  for (const a of unit.atoms) {
    if (a.h || a.soft || a.br) continue
    const letter = /[\p{L}\p{N}]/u.test(a.c)
    if (!a.child) {
      if (letter) loose = true
      continue
    }
    let list = byChild.get(a.child)
    if (list === undefined) byChild.set(a.child, (list = []))
    list.push(a)
  }
  const parts = [...byChild.values()]
    .map((atoms) => ({
      text: shownText(atoms),
      link: atoms.find((a) => a.a && /[\p{L}\p{N}]/u.test(a.c))?.a ?? null
    }))
    .filter((part) => /[\p{L}\p{N}]/u.test(part.text))
  if (loose || parts.length < 2) return [{ text: unit.shown, link: unitLink(unit) }]
  return parts
}
