// html-content.mjs — a rendered (or statically bound) HTML page → the content a spec-pack carries.
//
// Reads a DOM, not a file: the caller decides whether the DOM came from a browser (from-html
// --render), from the canvas static binder, or from a plain HTML file. Everything here is a
// heuristic over landmarks and structure, and every heuristic says so in its name; nothing is
// invented — a section whose type cannot be told stays `null` and the caller keeps it as HTML.
//
//   normaliseDom(doc, ctx)   — <image-slot> → <img>, links → WordPress paths, image src →
//                              /wp-content/uploads/<basename>; returns the images and assets seen
//   extractMenus(doc)        — topbar / header nav / footer columns / legal row, as label + href
//   extractMain(doc, ctx)    — the main region as a stack of typed sections, or as block markup
//   splitBlocks(el)          — one source section that stacks several heading-led blocks → one
//                              element per block (null when it holds one block)
//   sectionItems(el)         — the repeated cards of a section, and the chip strip it skipped
//   textOf(node)             — text with `<br>` read as a space (textContent drops it)
//   detectSectionType(el)    — hero · services · projects · news · stats · cta · faq · team ·
//                              contact · form · gallery · slide · text, or null
//   listingCards(main)       — <article> cards of a listing page (title, excerpt, image, meta)
//   contactFacts(doc)        — email / phone / address found on a contact page
//   siteIdentity(doc)        — site name and tagline from <title> and the header brand block

import { convertHtml } from './html-to-blocks.mjs'
import { cardEyebrow } from './post-content.mjs'

/**
 * The text of a node with a `<br>` read as a space. `textContent` reads it as nothing, so a
 * heading the author broke over two lines ("for<br>next") came out glued ("fornext") in every
 * field and item — the same in the rendered DOM and in the statically bound one.
 */
export const textOf = (el) => {
  if (!el) return ''
  if (el.nodeType === 3) return String(el.nodeValue).replace(/\s+/g, ' ').trim()
  const out = []
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push(c.nodeValue)
      else if (c.nodeType === 1) {
        if (c.tagName === 'BR') out.push(' ')
        else walk(c)
      }
    }
  }
  walk(el)
  return out.join('').replace(/\s+/g, ' ').trim()
}
const text = textOf
/** Leaf texts joined by spaces — `textContent` glues "Sales" and "sales@…" together. */
const spaced = (el) => {
  const out = []
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) out.push(c.nodeValue)
      else if (c.nodeType === 1 && c.tagName === 'BR') out.push(' ')
      else if (c.nodeType === 1 && !/^(script|style)$/i.test(c.tagName)) walk(c)
    }
    out.push(' ')
  }
  walk(el)
  return out.join('').replace(/\s+/g, ' ').trim()
}
const short = (s, n = 80) => s.length > 0 && s.length <= n
/** A leaf: an element with no element children — a `<br>` does not count, it is a line break in the leaf's text. */
const isLeaf = (e) => [...e.children].every((c) => c.tagName === 'BR')
const hasWord = (s) => /[\p{L}\p{N}]/u.test(s)
/** Trailing / leading decorative glyphs of a link label ("Resources ▼", "→ More"). */
export const cleanLabel = (s) =>
  String(s)
    .replace(/^[\s\u2190-\u21ff\u25b2-\u25bf\u203a\u00bb\u2022·|]+|[\s\u2190-\u21ff\u25b2-\u25bf\u203a\u00bb\u2022·|]+$/g, '')
    .trim()
const HEADING = 'h1, h2, h3, h4, h5, h6'
const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|zip)(\?|#|$)/i

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** `./img/x.png` from `RU/Home_ru.html` → `img/x.png` (source-root-relative, posix). */
export function resolveRelative(ref, fromFile) {
  const clean = String(ref).split('#')[0].split('?')[0]
  if (!/^\.{1,2}\//.test(clean) && /^[a-z]+:/i.test(clean)) return null
  const base = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')).split('/') : []
  const parts = clean.replace(/^\.\//, '').split('/')
  const out = [...base]
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p === '.' || p === '') continue
    else out.push(p)
  }
  return out.join('/')
}

/**
 * Normalise a page DOM in place. `ctx.pathOf(file)` → the WordPress path of a source page file
 * (or null), `ctx.file` the page's own source path. Returns `{ images, assets, links }`.
 */
export function normaliseDom(doc, ctx) {
  const images = []
  const assets = []
  const links = { internal: 0, external: 0, dead: 0, anchors: 0, unresolved: [] }
  const seenImage = new Set()
  // <image-slot src placeholder> is the canvas' image element; the runtime renders it in a shadow
  // root, so the light DOM keeps the attributes and nothing else. An <img> is what the seeder reads.
  for (const slot of [...doc.querySelectorAll('image-slot')]) {
    const img = doc.createElement('img')
    const src = slot.getAttribute('src')
    if (src) img.setAttribute('src', src)
    img.setAttribute('alt', slot.getAttribute('alt') || slot.getAttribute('placeholder') || '')
    if (slot.id) img.id = slot.id
    img.setAttribute('data-image-slot', slot.getAttribute('shape') || 'rect')
    if (!src) img.setAttribute('data-placeholder', slot.getAttribute('placeholder') || '')
    slot.replaceWith(img)
  }
  for (const img of doc.querySelectorAll('img[src]')) {
    const original = img.getAttribute('src')
    if (/^(data:|https?:|\/\/)/i.test(original)) continue
    const rel = resolveRelative(original, ctx.file)
    const file = rel ? rel.split('/').pop() : original.split('/').pop()
    img.setAttribute('src', `/wp-content/uploads/${file}`)
    const key = rel ?? original
    if (!seenImage.has(key)) {
      seenImage.add(key)
      images.push({ src: `/wp-content/uploads/${file}`, file, original: rel ?? original, alt: img.getAttribute('alt') || '' })
    }
  }
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href')
    if (!href || href === '#' || href.startsWith('#')) {
      if (href === '#' || !href) links.dead++
      else links.anchors++
      continue
    }
    if (/^(https?:|mailto:|tel:|\/\/)/i.test(href)) {
      links.external++
      continue
    }
    const rel = resolveRelative(href, ctx.file)
    const hash = href.includes('#') ? href.slice(href.indexOf('#')) : ''
    const path = rel ? ctx.pathOf(rel) : null
    if (path) {
      a.setAttribute('href', path + hash)
      links.internal++
      continue
    }
    if (rel && DOC_EXT.test(rel)) {
      const file = rel.split('/').pop()
      a.setAttribute('href', `/wp-content/uploads/${file}${hash}`)
      if (!assets.some((x) => x.original === rel)) assets.push({ file, original: rel, kind: 'document' })
      continue
    }
    links.unresolved.push(href)
  }
  return { images, assets, links }
}

// ── chrome ────────────────────────────────────────────────────────────────────

/** A link's label: the first titled child when the anchor stacks a title over a description. */
export function linkLabel(a) {
  const kids = [...a.children].filter((c) => text(c))
  return cleanLabel(text(kids.length >= 2 ? kids[0] : a))
}
const anchorsOf = (root) =>
  [...root.querySelectorAll('a')]
    .map((a) => ({ label: linkLabel(a), href: a.getAttribute('href') ?? null, el: a }))
    .filter((x) => x.label && hasWord(x.label))

/** First short, non-link text inside `cell` that precedes its first anchor — the column heading. */
function columnHeading(cell) {
  const first = cell.querySelector('a')
  for (const el of cell.querySelectorAll('*')) {
    if (first && el.compareDocumentPosition(first) & 2) break // el is after the anchor
    if (el === first || el.closest('a')) continue
    if (!isLeaf(el)) continue
    const t = text(el)
    if (short(t, 40)) return t
  }
  return null
}

/**
 * Menus from the chrome: `{ id, title, region, items: [{ label, href }] }`. The header's `<nav>`
 * anchors are the primary menu; footer columns are one menu each, named by their heading; the
 * legal row (anchors outside the columns) is `footer-legal`; a bar above the header is `topbar`.
 */
export function extractMenus(doc) {
  const menus = []
  const header = doc.querySelector('header, [role="banner"]')
  const footer = doc.querySelector('footer, [role="contentinfo"]')
  if (header) {
    const nav = header.querySelector('nav, [role="navigation"]') ?? header
    const items = anchorsOf(nav).map(({ label, href }) => ({ label, href }))
    if (items.length) menus.push({ id: 'header', title: 'Header', region: 'header', items })
    // A bar above the header with links (careers, investors, language) — a utility menu.
    let bar = header.previousElementSibling
    while (bar && !anchorsOf(bar).length) bar = bar.previousElementSibling
    if (bar && bar.tagName !== 'HEADER') {
      const items = anchorsOf(bar).map(({ label, href }) => ({ label, href }))
      if (items.length >= 2) menus.push({ id: 'topbar', title: 'Top bar', region: 'topbar', items })
    }
  }
  if (footer) {
    const used = new Set()
    // The column grid: the first element with ≥2 children where some child holds ≥2 anchors.
    const grid = [...footer.querySelectorAll('*')].find(
      (el) => el.children.length >= 2 && [...el.children].some((c) => c.querySelectorAll('a').length >= 2)
    )
    if (grid) {
      let n = 0
      for (const cell of grid.children) {
        const links = anchorsOf(cell)
        if (links.length < 2) continue
        n++
        const heading = columnHeading(cell)
        const id = heading ? `footer-${slugify(heading) || n}` : `footer-${n}`
        // `column` is the column's ordinal and whether it carries a heading: a secondary locale
        // pairs its columns with the default locale's by ordinal, and a heading-less column is
        // the one a synthesised footnav block stands in for.
        menus.push({
          id,
          title: heading ?? `Footer ${n}`,
          region: 'footer',
          column: { n, named: heading !== null },
          items: links.map(({ label, href }) => ({ label, href }))
        })
        for (const l of links) used.add(l.el)
      }
    }
    const rest = anchorsOf(footer).filter((l) => !used.has(l.el))
    if (rest.length >= 2)
      menus.push({ id: 'footer-legal', title: 'Footer legal', region: 'footer', items: rest.map(({ label, href }) => ({ label, href })) })
  }
  return menus
}

/** Site name from `<title>` ("Northgate Industrial — Home") and tagline from the header brand block. */
export function siteIdentity(doc) {
  const title = text(doc.querySelector('title'))
  const fullName = title.split(/\s+[—–|:]\s+|\s+-\s+/)[0].trim() || null
  let name = fullName
  let tagline = null
  const header = doc.querySelector('header, [role="banner"]')
  if (header && name) {
    const firstWord = name.split(/\s+/)[0].toLowerCase()
    for (const el of header.querySelectorAll('*')) {
      if (!isLeaf(el) || el.closest('a, nav')) continue
      const t = text(el)
      if (t && (t.toLowerCase() === name.toLowerCase() || t.toLowerCase() === firstWord)) {
        const next = el.nextElementSibling
        const nt = text(next)
        if (next && !next.querySelector('a') && short(nt, 100) && nt.toLowerCase() !== t.toLowerCase()) tagline = nt
        // The chrome shows a SHORTER wordmark than the document title ("NORTHGATE" under a
        // <title> of "Northgate Industrial — Home"): the wordmark is the name a visitor reads on
        // every page, and it is the one thing a CMS has a single field for. Keep the title's
        // casing — the design decides whether it prints in caps, and a blogname in caps would
        // shout from the browser tab and every e-mail the site sends.
        if (t.toLowerCase() === firstWord && t.toLowerCase() !== name.toLowerCase()) name = name.split(/\s+/)[0]
        break
      }
    }
  }
  // `name` is what the chrome shows (the CMS's one name field); `fullName` is what the document
  // title says, which is the better THEME name — a theme is filed under the company, not the mark.
  return { name, tagline, title, fullName }
}

// ── main region ───────────────────────────────────────────────────────────────

/** The main region: `<main>`, `[role=main]`, or the body without header/footer/nav/aside. */
function mainRegion(doc) {
  const main = doc.querySelector('main, [role="main"]')
  if (main) return { el: main, landmark: true }
  const clone = doc.body.cloneNode(true)
  for (const el of clone.querySelectorAll('header, footer, nav, aside, script, style')) el.remove()
  return { el: clone, landmark: false }
}

const SECTION_KEYWORDS = [
  ['hero', /\bhero\b|masthead|jumbotron/i],
  ['services', /service|capabilit|what-we-do|what we do|услуг|направлен|компетенц|чем мы|что мы/i],
  ['projects', /project|portfolio|case-?stud|\b(our|selected|recent|latest|featured)\s+works?\b|объект|проект|кейс/i],
  ['news', /\bnews|blog|article|insight|press|новост|стать|публикац|пресс/i],
  ['stats', /\bstat|number|figure|kpi|цифр|факт|показател/i],
  ['faq', /\bfaq|question|вопрос/i],
  ['team', /\bteam|people|leadership|staff|команд|руководств|сотрудник/i],
  ['contact', /contact|reach-us|get-in-touch|контакт|связ/i],
  ['form', /\bform|apply|subscribe|newsletter|signup|форм|подпис|заявк|анкет/i],
  ['gallery', /gallery|photos|logos|clients|partners|галере|фото|логотип|клиент|партн/i],
  ['slide', /slide|carousel|slider|deck|презентац|слайд/i],
  ['cta', /\bcta\b|call-to-action|band|banner|promo|estimate|quote|смет/i]
]
const NUMERIC_RE = /^[\d.,\s]+(\+|%|k|m|млн|тыс|м²|ha|га|лет|года|years?)?(\s+[^\d\s]{1,14})?$/i

/**
 * Section type from, in order: the element's id/class tokens; its structure (form controls,
 * numbers, image walls); the heading text; a CTA shape. `null` when nothing matches.
 * `ctx.first` says this is the first section of its page (the hero position).
 */
export function detectSectionType(el, ctx = {}) {
  const own = text(el)
  if (
    (el.matches('nav, [aria-label*="readcrumb" i], .breadcrumb, .breadcrumbs') || (ctx.first && own.length <= 80)) &&
    el.querySelector('a[href]') &&
    /[/›»>]/.test(own) &&
    !el.querySelector(HEADING)
  )
    return 'breadcrumb'
  const tokens = `${el.id ?? ''} ${el.className ?? ''}`
    .replace(/^sec-|\bsec-|section-/g, ' ')
    .toLowerCase()
  for (const [type, re] of SECTION_KEYWORDS) if (tokens.trim() && re.test(tokens)) return type
  const headings = [...el.querySelectorAll(HEADING)]
  const h1 = el.querySelector('h1')
  const inputs = el.querySelectorAll('input, textarea, select').length
  const imgs = el.querySelectorAll('img').length
  const paragraphs = el.querySelectorAll('p').length
  if (inputs >= 2) return 'form'
  if (ctx.first && h1) return 'hero'
  // Numbered rows — three or more repeated items each led by an ordinal (01, 02, 03…), a process
  // list — are the numbered-card shape: `services`, whose card carries the ordinal as its meta.
  // Read by its heading the list took whatever word the heading held ("How we run a project" →
  // `projects`, picture cards), and the ordinal sat in the title slot, the title in the text slot
  // and the body in the meta slot (full-2, 15/09: 60 rows on projects alone). Checked before the
  // figures test too: four ordinals among twelve leaves would read as stats.
  if (isNumberedRows(el)) return 'services'
  // A table — rows of three or more cells, as the canvas draws one with divs — is not stats:
  // a stat has a figure and a caption, and read as stats the table keeps two of its four
  // columns (the IR key figures lost 2025 and the change). No section type carries a table;
  // null keeps every column as core/html.
  if (isTable(el)) return null
  // Numbers: ≥3 leaf elements that are a figure ("380+", "1.2M m²") each with a short caption.
  const leafTexts = [...el.querySelectorAll('*')].filter(isLeaf).map(text).filter(Boolean)
  const figures = leafTexts.filter((t) => t.length <= 14 && /\d/.test(t) && NUMERIC_RE.test(t))
  if (figures.length >= 3 && figures.length * 3 >= leafTexts.length) return 'stats'
  // A band: one heading, at most one paragraph, one or two links or buttons, and little else.
  // Three or more links under a heading are a list of links (the links shape), not a band.
  const ctas = el.querySelectorAll('a, button').length
  if (headings.length >= 1 && paragraphs <= 1 && ctas >= 1 && ctas <= 2 && leafTexts.length <= 6 && imgs === 0) return 'cta'
  const top = headings.slice().sort((a, b) => a.tagName[1] - b.tagName[1])[0]
  const headingText = top ? text(top) : ''
  for (const [type, re] of SECTION_KEYWORDS) if (type !== 'cta' && headingText && re.test(headingText)) return type
  if (imgs >= 4 && paragraphs <= 1 && headings.length <= 1) return 'gallery'
  if (headings.length && paragraphs) return 'text'
  return null
}

/**
 * A table drawn with elements: a `<table>` with rows, or a parent whose ≥3 same-shaped children
 * each hold ≥4 short leaf cells (a header row of labels, then rows of label + figures). Four,
 * not three: a pricing or dividend row is name + description + figure, and those are items.
 */
function isTable(el) {
  if (el.querySelector('table tr + tr')) return true
  const cells = (row) => [...row.querySelectorAll('*')].filter((e) => isLeaf(e) && hasWord(text(e)) && short(text(e), 40))
  for (const parent of [el, ...el.querySelectorAll('*')]) {
    const rows = [...parent.children].filter((c) => text(c))
    if (rows.length < 3) continue
    const groups = new Map()
    for (const r of rows) {
      const sig = signature(r)
      if (!groups.has(sig)) groups.set(sig, [])
      groups.get(sig).push(r)
    }
    for (const g of groups.values()) {
      if (g.length < 3) continue
      const counts = g.map((r) => cells(r).length)
      if (counts.every((n) => n >= 4 && n === counts[0]) && g.every((r) => !r.querySelector('img, p, ' + HEADING))) return true
    }
  }
  return false
}

/**
 * Signature of an element for "repeated sibling" detection. A card — an element with an image or
 * a heading, and some text — is signed by its tag, image presence and heading level, so a lead
 * card with its own inner wrapper (`<article><div>…</div><div>…</div>`) and its siblings that
 * wrap the same text in a link (`<article><div>…</div><a>…</a>`) still form one group. Anything
 * else is signed by tag + sorted child tags, as before.
 */
const signature = (el) => {
  const img = el.querySelector('img') ? 'img' : ''
  const heading = el.querySelector(HEADING)
  if ((img || heading) && hasWord(text(el))) return `${el.tagName}:card:${img}:${heading ? heading.tagName : ''}`
  return `${el.tagName}:${[...el.children]
    .map((c) => c.tagName)
    .sort()
    .join(',')}`
}

/**
 * A chip / tab strip: 3–6 short labels (one or two words each, with letters) that are links,
 * buttons or tabs — or carry `cursor: pointer`, the canvas export's chip — with no image, no
 * heading and no paragraph inside. The filter row of a listing, not its items. Three is the
 * floor on purpose: a pair of short interactive labels is a form's two buttons or a hero's two
 * CTAs, and a stat's figure + caption is not interactive at all.
 */
const CHIP_MIN = 3
const CHIP_MAX = 6
const chipLike = (c) =>
  c.matches('a, button, [role="tab"], [role="button"]') || /cursor:\s*pointer/i.test(c.getAttribute('style') || '')
const isChipStrip = (g) =>
  g.length >= CHIP_MIN &&
  g.length <= CHIP_MAX &&
  g.every((c) => {
    const t = text(c)
    return (
      t.length <= 30 &&
      t.split(/\s+/).length <= 2 &&
      /\p{L}/u.test(t) &&
      chipLike(c) &&
      !c.querySelector('img') &&
      !c.querySelector(HEADING) &&
      !c.querySelector('p')
    )
  })

/**
 * The items of a section: the largest group of ≥2 sibling elements with the same shape inside
 * `root`, skipping chip strips — a group of short buttons/links with nothing in them but a label
 * is the listing's filter row (returned as `filters`, in DOM order), never its item set. One
 * strip per section: the largest, the first on a tie.
 */
export function sectionItems(root) {
  let best = []
  let chips = []
  for (const parent of [root, ...root.querySelectorAll('*')]) {
    if (parent.children.length < 2) continue
    const groups = new Map()
    for (const c of parent.children) {
      if (!text(c)) continue
      const sig = signature(c)
      if (!groups.has(sig)) groups.set(sig, [])
      groups.get(sig).push(c)
    }
    for (const g of groups.values()) {
      if (g.length < 2 || !g[0].children.length) continue
      if (isChipStrip(g)) {
        if (g.length > chips.length) chips = g
        continue
      }
      if (g.length > best.length) best = g
    }
  }
  return { items: best.map(itemOf), filters: chips.map((c) => text(c)), elements: best }
}

const isMetaLine = (t) => /[·•|—–]/.test(t) || t.split(/\s+/).length <= 3

/**
 * "01", "1.", "1)", "Step 3", "Шаг 3" — the ordinal a numbered row opens with; its number (≥ 1),
 * else null. A bare number is NOT one: "19" over "Open roles" and "0" over "Serious incidents"
 * are figures with captions, and only the zero pad, the dot or the word says "count".
 */
const ORDINAL_RE = /^(?:(?:step|шаг|этап)\s*(\d{1,2})|0(\d)|(\d{1,2})[.)])$/i
const ordinalOf = (t) => {
  const m = ORDINAL_RE.exec((t ?? '').trim())
  const n = m ? Number(m[1] ?? m[2] ?? m[3]) : 0
  return n >= 1 ? n : null
}
/** The first word-bearing leaf of an element, in document order (the row's first line). */
const firstLeafText = (el) => [...el.querySelectorAll('*')].filter((e) => isLeaf(e) && hasWord(text(e))).map(text)[0] ?? null

/**
 * Three or more repeated rows that open with consecutive ordinals from 1 and carry no heading
 * of their own: a numbered list (a process, a "how it works"). Consecutive from 1 is what tells
 * it from a row of stats — "640", "34", "19" are figures, "01 02 03 04" is a count.
 */
function isNumberedRows(root) {
  const rows = sectionItems(root).elements
  if (rows.length < 3) return false
  const numbers = rows.map((r) => (r.querySelector(HEADING) ? null : ordinalOf(firstLeafText(r))))
  return numbers.every((n, i) => n === i + 1)
}

function itemOf(el) {
  const heading = el.querySelector(HEADING) ?? el.querySelector('strong, b')
  const leaf = [...el.querySelectorAll('*')].filter((e) => isLeaf(e) && hasWord(text(e)))
  // A row that opens with an ordinal and has no heading: the ordinal is the meta (the numbered
  // card's slot), the next short line the title, the longest of the rest the text. Read as
  // heading-less lines the ordinal took the title and the title fell to meta or text by length.
  if (!heading && leaf.length >= 2 && ordinalOf(text(leaf[0])) !== null) {
    const lines = leaf.map(text)
    const meta = lines[0]
    const title = lines.slice(1).find((t) => short(t, 90)) ?? lines[1]
    const rest = lines.slice(1).filter((t) => t !== title)
    const desc = rest.sort((x, y) => y.length - x.length)[0] ?? ''
    const img = el.querySelector('img[src]')
    const a = el.querySelector('a[href]')
    return { title, text: desc, meta, img: img ? img.getAttribute('src') : null, alt: img ? img.getAttribute('alt') || '' : null, href: a ? a.getAttribute('href') : null }
  }
  const title = heading ? text(heading) : (leaf.map(text).find((t) => short(t, 90)) ?? text(el).slice(0, 90))
  const p = el.querySelector('p')
  const img = el.querySelector('img[src]')
  const a = el.querySelector('a[href]')
  // A meta line is short AND label-shaped: a date, a figure, or a few words with a separator
  // ("Factory · 2025", "PDF · 14 KB", "28 Jul 2026") — and never the paragraph, which is the
  // text. "Serious incidents in 2025" is a stat's caption — a sentence with a year in it —
  // and lands in `text`, where its siblings are.
  const pText = p ? text(p) : null
  let meta = leaf.map(text).find((t) => t !== title && t !== pText && short(t, 60) && /\d{2,4}/.test(t) && isMetaLine(t)) ?? null
  const desc = p ? text(p) : (leaf.map(text).filter((t) => t !== title && t !== meta).sort((x, y) => y.length - x.length)[0] ?? '')
  // A card of three or more plain lines with no paragraph — name, role, bio (a team card) — has
  // one line that is neither the title nor the longest: short and label-shaped, it is the meta.
  // Read as title + text alone, the role fell out of the spec and the team section could not
  // be rendered typed (its run of roles was "dropped").
  if (meta === null && !p)
    meta = leaf.map(text).find((t) => t !== title && t !== desc && short(t, 60) && t.split(/\s+/).length <= 6) ?? null
  return {
    title,
    text: desc === title ? '' : desc,
    meta,
    img: img ? img.getAttribute('src') : null,
    alt: img ? img.getAttribute('alt') || '' : null,
    href: a ? a.getAttribute('href') : null
  }
}

/**
 * Eyebrow · heading · intro · CTAs of a section — the fields a library pattern has slots for.
 * `itemElements`: the section's items; a link or button inside one of them (a card's "Read the
 * case study →") is the item's own, not a section CTA — unless the item IS the link, as the
 * buttons of a cta band are (their text is the item's whole text).
 */
export function sectionFields(el, { itemElements = [] } = {}) {
  const heading = el.querySelector(HEADING)
  let eyebrow = null
  if (heading) {
    for (const e of el.querySelectorAll('*')) {
      if (e === heading || !(e.compareDocumentPosition(heading) & 4)) break // stop at / after the heading
      if (!isLeaf(e) || e.closest('a')) continue
      const t = text(e)
      // The uppercase/tracking style may sit on a wrapper (a pill: dot span + text span in a
      // styled div), so read the leaf's own style and its ancestors' up to the section.
      let style = ''
      for (let n = e; n && n !== el; n = n.parentElement) style += ` ${(n.getAttribute('style') || '').toLowerCase()}`
      if (short(t, 40) && (style.includes('uppercase') || style.includes('letter-spacing') || t === t.toUpperCase())) eyebrow = t
    }
  }
  const paragraphs = [...el.querySelectorAll('p')].map(text).filter(Boolean)
  const intro = paragraphs.find((t) => t.length <= 400) ?? null
  const ownedByItem = (a) =>
    itemElements.some((it) => it !== a && it.contains(a) && (text(it) !== text(a) || a.querySelector('img, p, ' + HEADING)))
  // A card drawn as one anchor (`<a href><img><div>title</div><div>meta</div></a>`) is an item,
  // not a call to action: a CTA is a label — text and inline spans — while a card lays out
  // blocks. Read as a CTA the card became a button whose label was the whole card ("Elektra
  // plant, Lipetsk SEZ 62,000 m² · 2025") — four of them under "Other projects", both locales.
  const isCard = (a) => !!a.querySelector('div, p, img, figure, ul, ol, table, section, article, ' + HEADING)
  const ctas = [...el.querySelectorAll('a[href], button')]
    .filter((a) => !ownedByItem(a) && !isCard(a))
    .map((a) => ({ text: text(a), href: a.getAttribute('href') ?? null }))
    .filter((c) => short(c.text, 60))
    .slice(0, 4)
  return {
    eyebrow,
    heading: heading ? text(heading) : null,
    headingLevel: heading ? Number(heading.tagName[1]) : null,
    intro,
    ctas
  }
}

// ── one source section, several blocks ────────────────────────────────────────

/** A row of cards: ≥3 siblings of one shape. A pair is two columns, and a column is a block. */
const CARD_ROW_MIN = 3
/** A heading that can lead a block of its own — h3 and below title what is inside a block. */
const BLOCK_HEADING = 'h1, h2'

/**
 * Elements of `root` whose heading, if any, titles an item rather than a block: the members of
 * a card row (same signature, ≥3 of them — the item floor of `sectionItems`, one up so a pair of
 * columns stays two blocks), plus `<article>` and `<li>`, which are items by name.
 */
function itemScopes(root) {
  const scopes = new Set([...root.querySelectorAll('article, li')])
  for (const parent of [root, ...root.querySelectorAll('*')]) {
    if (parent.children.length < CARD_ROW_MIN) continue
    const groups = new Map()
    for (const c of parent.children) {
      if (!text(c)) continue
      const sig = signature(c)
      if (!groups.has(sig)) groups.set(sig, [])
      groups.get(sig).push(c)
    }
    for (const g of groups.values()) if (g.length >= CARD_ROW_MIN) for (const c of g) scopes.add(c)
  }
  return scopes
}

/**
 * A row with a sidebar: an element laid out as a row (inline `display: flex` that is not a
 * column, or a grid) with an `<aside>` among its direct children. That is a page layout — main
 * column beside sidebar — not a stack of blocks: cut apart, the sidebar became a full-width block
 * under the main column's pieces and the source's two columns were gone (the Slides page).
 */
const isLayoutRow = (el) => {
  const style = (el.getAttribute('style') ?? '').toLowerCase()
  const row = (/display:\s*flex/.test(style) && !/flex-direction:\s*column/.test(style)) || /display:\s*(inline-)?grid/.test(style)
  return row && [...el.children].some((c) => c.tagName === 'ASIDE')
}

/**
 * Split one source section into the blocks it stacks: every `h1`/`h2` outside an item starts a
 * block, and an `<aside>` outside an item is a block of its own (a sidebar is not the tail of
 * whatever heading came before it). Returns `null` when that gives fewer than two blocks, so a
 * section with one heading, or with its second heading inside a card, is untouched. Nothing
 * inside a row with a sidebar (`isLayoutRow`) is a cut — the row is one block.
 *
 * A block is the section's tree pruned to one range of document order: the wrapper chain above
 * a heading is cloned shallow, the content between this heading and the next is cloned whole.
 * What stands before the first heading (eyebrow, lead) joins the first block. Every text node of
 * the source lands in exactly one block. The first block keeps the wrapper's `id` and `class` —
 * they name the block the author named; a later block is one the author did not name, so it is
 * classified by what it holds and keeps only the wrapper's tag and `style`.
 */
function splitBlocks(root) {
  const order = [root, ...root.querySelectorAll('*')]
  const pos = new Map(order.map((el, i) => [el, i]))
  const end = (el) => pos.get(el) + 1 + el.querySelectorAll('*').length
  const scopes = itemScopes(root)
  for (const el of order) if (isLayoutRow(el)) scopes.add(el)
  const inItem = (el) => {
    for (let e = el; e; e = e.parentElement) {
      if (scopes.has(e)) return true
      if (e === root) break
    }
    return false
  }
  const heads = [...root.querySelectorAll(BLOCK_HEADING)].filter((h) => !inItem(h)).map((h) => pos.get(h))
  // What stands before the first heading (eyebrow, lead) is the head of its block, not a block.
  const cuts = new Set(heads.slice(1))
  for (const a of root.querySelectorAll('aside')) {
    if (inItem(a) || a === root) continue
    cuts.add(pos.get(a))
    cuts.add(end(a))
  }
  const bounds = [0, ...[...cuts].filter((c) => c > 0 && c < order.length).sort((a, b) => a - b), order.length]
  const ranges = []
  for (let i = 0; i + 1 < bounds.length; i++) if (bounds[i + 1] > bounds[i]) ranges.push([bounds[i], bounds[i + 1]])
  if (ranges.length < 2) return null
  const prune = (node, lo, hi) => {
    const p = pos.get(node)
    const e = end(node)
    if (e <= lo || p >= hi) return null
    if (p >= lo && e <= hi && node !== root) return node.cloneNode(true)
    const clone = node.cloneNode(false)
    let last = p // document position the next text node hangs off: the last element seen so far
    for (const child of node.childNodes) {
      if (child.nodeType === 1) {
        const kept = prune(child, lo, hi)
        if (kept) clone.appendChild(kept)
        last = end(child) - 1
      } else if (child.nodeType === 3 || child.nodeType === 8) {
        if (last >= lo && last < hi) clone.appendChild(child.cloneNode(true))
      }
    }
    // A wrapper cloned shallow that ends up with nothing of this range in it — the card a later
    // block took whole — would stand in this block as an empty box wearing the card's border and
    // padding. It is dropped; the root stays so every block keeps the section's tag and style.
    if (node !== root && !text(clone) && !clone.querySelector('img')) return null
    return clone
  }
  const blocks = ranges.map(([lo, hi]) => prune(root, lo, hi)).filter((b) => b && (text(b) || b.querySelector('img')))
  if (blocks.length < 2) return null
  for (const b of blocks.slice(1)) {
    b.removeAttribute('id')
    b.removeAttribute('class')
  }
  return blocks
}

/**
 * The contact page's head-office card — a short label ("Head office"), an address line, then
 * rows of label + value (hotline, sales, hours) — drawn in the form section's side column,
 * moved into the hero (the block with the h1) and read as the hero's items. The `contact`
 * pattern draws exactly that card beside the h1; left in the form section it had no slot,
 * its runs were "dropped", and the whole form section fell back to core/html. `blocks` are the
 * page's top-level blocks; returns `{ hero, card, items }` or null when the page has no such
 * pair. The DOM is changed in place.
 */
function hoistContactCard(blocks) {
  const hero = blocks.find((b) => b.querySelector('h1'))
  if (!hero) return null
  // Text only: inline wrappers (the canvas's `sc-interp` spans, a `<br>`) and nothing else.
  const textual = (el) => hasWord(text(el)) && !el.querySelector('div, p, ul, ol, li, table, section, article, img, a, input, button, ' + HEADING)
  const cells = (row) => [...row.children].filter((c) => hasWord(text(c)))
  const isRow = (el) => textual(el) && cells(el).length === 2 && short(text(el), 120)
  for (const b of blocks) {
    if (b === hero || !b.querySelector('input, textarea, select')) continue
    for (const card of b.querySelectorAll('*')) {
      if (card.querySelector('input, textarea, select, button, img')) continue
      const kids = [...card.children].filter((c) => text(c))
      if (kids.length < 3) continue
      const [label, address, rows] = kids
      const rowEls = [...rows.children].filter((c) => text(c))
      if (!(textual(label) && short(text(label), 30) && text(label).split(/\s+/).length <= 3)) continue
      if (!textual(address)) continue
      if (rowEls.length < 2 || !rowEls.every(isRow)) continue
      const items = [
        { title: text(label), text: text(address), meta: null, img: null, alt: null, href: null },
        ...rowEls.map((r) => {
          const [k, v] = cells(r).map(text)
          return { title: k, text: v, meta: null, img: null, alt: null, href: null }
        })
      ]
      hero.appendChild(card)
      return { hero, card, items }
    }
  }
  return null
}

/**
 * The main region as sections. Section mode when the main region is a stack of `<section>`s (or
 * ≥2 landmark/heading-led blocks); otherwise blocks mode: the whole main region as block markup.
 * `ctx.idPrefix` names the sections (`home-en`), `ctx.view` is the page view. A source section
 * that stacks several heading-led blocks is one section per block (`splitBlocks`).
 */
export function extractMain(doc, ctx) {
  const { el: main, landmark } = mainRegion(doc)
  const children = [...main.children].filter((c) => !/^(script|style|template)$/i.test(c.tagName))
  const sectionish = children.filter((c) => c.tagName === 'SECTION' || (c.querySelector(HEADING) && text(c)))
  // A stack: any <section> child, or ≥2 children of which at least one leads with a heading.
  const stack = children.some((c) => c.tagName === 'SECTION') || (children.length >= 2 && sectionish.length >= 1)
  if (!stack || !children.length) {
    const conv = convertHtml(main.innerHTML)
    // Every picture of the page, not only those the converter turned into core/image: an <img>
    // inside a wrapper that stays core/html is still a file the seeder must import, and the
    // style guide's three specimen frames (gd-1..3) reached the site as 404s for that reason.
    const listed = new Set(conv.images.map((i) => i.src))
    const images = [...conv.images]
    for (const img of main.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src')
      if (listed.has(src)) continue
      listed.add(src)
      images.push({ src, file: src.split('/').pop(), alt: img.getAttribute('alt') || '' })
    }
    return { mode: 'blocks', landmark, markup: conv.markup, images, sections: [], text: text(main) }
  }
  const sections = []
  const blocks = children.flatMap((c, i) => (splitBlocks(c) ?? [c]).map((el) => ({ el, first: i === 0 })))
  const hoisted = ctx.view === 'page-contact' ? hoistContactCard(blocks.map((b) => b.el)) : null
  blocks.forEach(({ el: c, first }) => {
    if (!text(c) && !c.querySelector('img')) return
    const type = detectSectionType(c, { first: first && sections.length === 0, view: ctx.view })
    const found = sectionItems(c)
    const items = hoisted?.hero === c ? hoisted.items : found.items
    const fields = sectionFields(c, { itemElements: found.elements })
    fields.filters = found.filters
    const images = [...c.querySelectorAll('img[src]')].map((img) => ({
      src: img.getAttribute('src'),
      file: img.getAttribute('src').split('/').pop(),
      alt: img.getAttribute('alt') || ''
    }))
    const index = sections.length + 1
    const label = [...c.querySelectorAll('*')].filter(isLeaf).map(text).find((t) => short(t, 60) && hasWord(t))
    sections.push({
      id: `${ctx.idPrefix}-${index}`,
      index,
      tag: c.tagName.toLowerCase(),
      domId: c.id || null,
      type,
      title: fields.heading ?? fields.eyebrow ?? label ?? (c.id ? c.id : `Section ${index}`),
      html: c.outerHTML,
      fields,
      items,
      images,
      textLength: text(c).length
    })
  })
  return { mode: 'sections', landmark, markup: null, images: sections.flatMap((s) => s.images), sections, text: text(main) }
}

/** `<article>` cards of a listing page: what a synthesised post can carry — plus the card's eyebrow (its category). */
export function listingCards(doc) {
  const { el: main } = mainRegion(doc)
  return [...main.querySelectorAll('article')]
    .filter((a) => a.querySelector('h2, h3, h4') && !a.querySelector('article'))
    .map((a) => ({ ...itemOf(a), eyebrow: cardEyebrow(a) }))
    .filter((c) => c.title)
}

const EMAIL_RE = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g

/** Email · phone · address seen on a page (the contact page, usually). Everything is text-level. */
export function contactFacts(doc) {
  const { el: main } = mainRegion(doc)
  const body = spaced(main)
  const email = [...body.matchAll(EMAIL_RE)].map((m) => m[0])
  const tel = [...doc.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute('href').slice(4))
  const phone = tel.length ? tel : [...body.matchAll(PHONE_RE)].map((m) => m[0].trim()).filter((p) => /\d{3}/.test(p))
  let address = null
  for (const el of main.querySelectorAll('*')) {
    if (!isLeaf(el)) continue
    const t = text(el)
    if (/^(head office|headquarters|office|address|адрес|головной офис|офис)$/i.test(t)) {
      const lines = []
      let n = el.nextElementSibling ?? el.parentElement?.nextElementSibling
      while (n && lines.length < 2) {
        const nt = spaced(n)
        if (!nt || !short(nt, 120) || EMAIL_RE.test(nt)) break
        lines.push(nt)
        n = n.nextElementSibling
      }
      if (lines.length) address = lines.join(', ')
      break
    }
  }
  return {
    email: email[0] ?? null,
    phone: phone[0] ?? null,
    address,
    hours: body.match(/(?:Mon|Пн)[^.]{3,60}\d{1,2}:\d{2}/)?.[0] ?? null
  }
}

/** Length and heading count of the page — the honesty numbers provenance reports. */
export function pageStats(doc) {
  const { el: main } = mainRegion(doc)
  return {
    textLength: text(doc.body).length,
    mainTextLength: text(main).length,
    headings: main.querySelectorAll(HEADING).length,
    images: doc.querySelectorAll('img').length,
    holes: (text(doc.body).match(/\{\{/g) ?? []).length
  }
}
