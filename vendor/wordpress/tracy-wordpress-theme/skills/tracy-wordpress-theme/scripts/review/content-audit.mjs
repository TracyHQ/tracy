// Content checks a port can pass every older gate and still fail — found by an independent audit of two T4
// ports (JA Essence, JA Impact), each measured against its live source:
//
//   cms-leftover        the rendered site names the CMS it was ported from: "Joomla!" in the footer, an
//                       `index.php?option=` link, `com_content` in an attribute, "T4 Framework", a JoomlArt copyright.
//   listing-duplicate   a listing on the site prints one post title more than once where the source listing prints
//                       it at most once (one WordPress post per category for one shared article — S-03).
//   category-tree       the site holds the same category name under more than one parent where the source has it once,
//                       or a category slug that is not the source alias.
//
// Pure functions over HTML text and term lists, so the same code runs on a fixture, a seed report and a live site.
// A scan that examined nothing is not clean: every result carries `examined`, and a route that could not be read
// is `unmeasured`, never counted as passing.
import { JSDOM } from 'jsdom'
import { citationErrors } from '../lib/parity-acceptance.mjs'

// ─────────────────────────────────────────────── page reading
const SKIP_TEXT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD'])
const BLOCK = new Set(['BODY', 'HTML', 'P', 'LI', 'DIV', 'SECTION', 'FOOTER', 'HEADER', 'ARTICLE', 'ASIDE', 'NAV', 'MAIN', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'FIGCAPTION', 'SMALL', 'ADDRESS', 'DD', 'DT'])
/** Attributes whose value a visitor can read, follow or inspect: where the CMS's plumbing shows. */
const PLUMBING_ATTRS = ['href', 'src', 'srcset', 'action', 'formaction', 'content', 'title', 'alt', 'aria-label', 'value', 'poster', 'cite']

const collapse = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
export const parseHtml = (html) => new JSDOM(String(html ?? '')).window.document

/** The region of the page an element sits in: where a leftover is, and whether a source exemption may stand on it. */
export function regionOf(el) {
  for (let n = el; n; n = n.parentElement) {
    const tag = n.tagName
    const role = n.getAttribute?.('role')
    if (tag === 'FOOTER' || role === 'contentinfo') return 'footer'
    if (tag === 'HEADER' || role === 'banner') return 'header'
    if (tag === 'NAV' || role === 'navigation') return 'nav'
    if (tag === 'ASIDE' || role === 'complementary') return 'aside'
  }
  return 'content'
}

/** A readable context path for a finding: `footer > div.copyright > p`. */
function hintOf(el) {
  const parts = []
  for (let n = el; n && n.tagName && n.tagName !== 'BODY' && parts.length < 4; n = n.parentElement) {
    const cls = collapse(n.getAttribute('class')).split(' ')[0]
    parts.unshift(`${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : cls ? `.${cls}` : ''}`)
  }
  return parts.join(' > ')
}

/** Lines of text the page shows (one per block element's own text, nested blocks apart), with region and hint. */
export function textLines(document) {
  const out = []
  const seen = new Set()
  const walk = (node) => {
    if (SKIP_TEXT.has(node.tagName)) return
    for (const child of node.childNodes) {
      if (child.nodeType === 1) walk(child)
      else if (child.nodeType === 3 && collapse(child.textContent)) {
        let block = node
        while (block.parentElement && !BLOCK.has(block.tagName)) block = block.parentElement
        if (seen.has(block)) continue
        seen.add(block)
        // the block's own words, nested blocks left to their own line
        const own = [...block.childNodes]
          .filter((c) => c.nodeType === 3 || (c.nodeType === 1 && !BLOCK.has(c.tagName) && !SKIP_TEXT.has(c.tagName)))
          .map((c) => c.textContent)
          .join(' ')
        const text = collapse(own)
        if (text) out.push({ text, region: regionOf(block), hint: hintOf(block) })
      }
    }
  }
  if (document.body) walk(document.body)
  const title = collapse(document.querySelector('title')?.textContent)
  if (title) out.push({ text: title, region: 'header', hint: 'title' })
  return out
}

/** The words of the source page's CONTENT: header, footer, navigation and aside left out (their branding is chrome). */
export const sourceContentText = (html) =>
  textLines(parseHtml(html))
    .filter((l) => l.region === 'content')
    .map((l) => l.text)
    .join('\n')

// ─────────────────────────────────────────────── CMS leftovers
export const CMS_TOKENS = Object.freeze([
  { id: 'joomla', re: /\bjoomla\b/i, where: 'anywhere' },
  { id: 'joomlart-copyright', re: /joomlart/i, where: 'copyright' },
  { id: 't4-framework', re: /\bT4\s*Framework\b/i, where: 'anywhere' },
  { id: 'index.php?option=', re: /index\.php\?option=/i, where: 'plumbing' },
  { id: 'com_content', re: /\bcom_content\b/i, where: 'anywhere' }
])
const COPYRIGHT = /©|&copy;|\(c\)|copyright|all rights reserved/i

/** @returns {string[]} the refusals of an allowlist: a row is a route, a token, the exact text, a reason. */
export function allowlistErrors(allow, { decisions } = {}) {
  if (allow == null) return []
  if (!Array.isArray(allow)) return ['the CMS-leftover allowlist is not a list']
  const errors = []
  allow.forEach((a, n) => {
    const at = `allow[${n}]`
    if (!a || typeof a !== 'object') return errors.push(`${at}: not an object`)
    if (typeof a.route !== 'string' || !a.route.startsWith('/') || /[*?[\]{}()|^$\\+]/.test(a.route)) errors.push(`${at}: needs one exact route`)
    if (!CMS_TOKENS.some((t) => t.id === a.token)) errors.push(`${at}: token must be one of ${CMS_TOKENS.map((t) => t.id).join(', ')}`)
    if (typeof a.text !== 'string' || !a.text.trim()) errors.push(`${at}: needs the exact text (or attribute value) the source shows`)
    if (typeof a.reason !== 'string' || !a.reason.trim()) errors.push(`${at}: needs a reason`)
    // with the dossier's decisions given (or a decision named), the citation names ONE existing decision that mentions the text it exempts
    if (decisions !== undefined || a.decision !== undefined) {
      if (decisions === undefined) errors.push(`${at}: cites ${JSON.stringify(a.decision)} and no decisions were given to read it against`)
      else for (const m of citationErrors(a.decision, [a.text], decisions)) errors.push(`${at}: ${m}`)
    }
  })
  return errors
}

/**
 * Scan one rendered page.
 * @param {string} html            the site page as served
 * @param {{route: string, allow?: object[], sourceHtml?: string|null}} o
 *   An allowlist row exempts a hit only when its text is in the hit, the hit is in the page's CONTENT (never the
 *   footer, header, navigation or an attribute) and the source page's own content shows that exact text.
 * @returns {{route: string, examined: number, findings: object[], exempt: object[]}}
 */
export function scanCmsLeftovers(html, { route, allow = [], sourceHtml = null }) {
  const errors = allowlistErrors(allow)
  if (errors.length) throw new Error(errors.join('; '))
  const document = parseHtml(html)
  const lines = textLines(document)
  const hits = []
  for (const l of lines) {
    for (const t of CMS_TOKENS) {
      if (t.where === 'plumbing') continue
      if (t.where === 'copyright' && !COPYRIGHT.test(l.text)) continue
      if (t.re.test(l.text)) hits.push({ kind: 'cms-leftover', route, token: t.id, in: 'text', region: l.region, context: l.text.slice(0, 200), hint: l.hint })
    }
  }
  const all = document.querySelectorAll('*')
  let attrs = 0
  for (const el of all) {
    if (SKIP_TEXT.has(el.tagName) && el.tagName !== 'TEMPLATE') continue
    for (const name of el.getAttributeNames()) {
      if (!PLUMBING_ATTRS.includes(name) && !name.startsWith('data-')) continue
      const value = el.getAttribute(name)
      if (!value) continue
      attrs++
      for (const t of CMS_TOKENS) {
        if (t.where === 'copyright') continue
        if (t.re.test(value)) hits.push({ kind: 'cms-leftover', route, token: t.id, in: `attribute ${el.tagName.toLowerCase()}[${name}]`, region: regionOf(el), context: value.slice(0, 200), hint: hintOf(el) })
      }
    }
  }
  const sourceText = sourceHtml == null ? null : sourceContentText(sourceHtml)
  const findings = []
  const exempt = []
  for (const h of hits) {
    const row = allow.find((a) => a.route === route && a.token === h.token && h.context.includes(a.text))
    if (row && h.in === 'text' && h.region === 'content' && sourceText != null && sourceText.includes(row.text)) exempt.push({ ...h, reason: row.reason })
    else findings.push(h)
  }
  const key = (f) => `${f.token}|${f.in}|${f.context}`
  const uniq = new Map(findings.map((f) => [key(f), f]))
  return { route, examined: lines.length + attrs, findings: [...uniq.values()], exempt }
}

/**
 * Scan every route of a plan. `fetchPage(route) → { status, html }` is the caller's reader (a live fetch, a stand);
 * `fetchSource(route) → html|null` reads the source page an exemption is checked against.
 * A route that cannot be read, answers other than 200, or examines nothing is `unmeasured`: the audit is not clean.
 */
export async function auditCmsLeftovers({ routes, fetchPage, fetchSource = async () => null, allow = [], decisions }) {
  const errors = allowlistErrors(allow, { decisions })
  if (errors.length) throw new Error(errors.join('; '))
  if (!Array.isArray(routes) || !routes.length) throw new Error('no routes to scan: a scan of nothing is not clean')
  const results = []
  for (const route of routes) {
    try {
      const page = await fetchPage(route)
      if (!page || page.status !== 200 || !page.html) {
        results.push({ route, unmeasured: `the route answered ${page?.status ?? 'nothing'}`, examined: 0, findings: [], exempt: [] })
        continue
      }
      const needSource = allow.some((a) => a.route === route)
      const source = needSource ? await fetchSource(route).catch(() => null) : null
      const r = scanCmsLeftovers(page.html, { route, allow, sourceHtml: source })
      if (r.examined === 0) results.push({ ...r, unmeasured: 'the page held nothing to examine' })
      else results.push(r)
    } catch (e) {
      results.push({ route, unmeasured: String(e.message).split('\n')[0].slice(0, 160), examined: 0, findings: [], exempt: [] })
    }
  }
  const findings = results.flatMap((r) => r.findings)
  const unmeasured = results.filter((r) => r.unmeasured).map((r) => ({ route: r.route, reason: r.unmeasured }))
  return { check: 'cms-leftovers', ok: !findings.length && !unmeasured.length, examined: results.reduce((n, r) => n + r.examined, 0), routes: results.length, findings, unmeasured, exempt: results.flatMap((r) => r.exempt) }
}

// ─────────────────────────────────────────────── listings
const ITEM_SELECTOR = [
  'li.wp-block-post',
  '.wp-block-post',
  'article',
  '.blog-item',
  '.item',
  '.card',
  '[class*="post-card"]',
  '[class*="article-card"]'
].join(',')
const CLONE = /\b(swiper-slide-duplicate|slick-cloned|cloned|clone|owl-item\s+cloned|splide__slide--clone)\b/i
const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden/i

const hiddenAncestry = (el) => {
  for (let n = el; n && n.getAttribute; n = n.parentElement) {
    if (n.tagName === 'TEMPLATE' || n.hasAttribute('hidden') || n.getAttribute('aria-hidden') === 'true') return true
    if (HIDDEN_STYLE.test(n.getAttribute('style') ?? '')) return true
    if (CLONE.test(n.getAttribute('class') ?? '')) return true
  }
  return false
}

/** A post title as a person compares it: case, spacing, punctuation and typographic quotes folded. */
export const titleKey = (t) =>
  String(t ?? '')
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}\s'"]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

function itemTitle(item) {
  const h = item.querySelector('h1,h2,h3,h4,h5,h6')
  const t = collapse(h?.textContent) || collapse(item.querySelector('.title,.entry-title,[class*="title"]')?.textContent) || collapse([...item.querySelectorAll('a')].map((a) => a.textContent).find((x) => collapse(x).length >= 3))
  return t
}

/**
 * The listings of a page: sibling sets of two or more post items, each item read as its title once (a heading that
 * holds a link is one title, not two), hidden templates and carousel clones left out.
 * @returns {{label: string, titles: string[]}[]}
 */
export function extractListings(html) {
  const document = parseHtml(html)
  const items = [...document.querySelectorAll(ITEM_SELECTOR)].filter((el) => !hiddenAncestry(el) && !el.parentElement?.closest(ITEM_SELECTOR))
  // a grid row (Joomla's `.items-row cols-3`, a Bootstrap `.row`) holds items; the listing is the container of the rows, not each row
  const ROW = /(^|\s)(items-row|row|row-cols-\d+|cols-\d+)(\s|$)/
  const containerOf = (el) => {
    let p = el.parentElement
    while (p && ROW.test(p.getAttribute('class') ?? '')) p = p.parentElement
    return p
  }
  const byParent = new Map()
  for (const el of items) {
    const key = containerOf(el)
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(el)
  }
  const listings = []
  for (const [parent, els] of byParent) {
    if (els.length < 2) continue
    const titles = els.map(itemTitle).filter(Boolean)
    if (titles.length < 2) continue
    let label = ''
    for (let n = parent; n && !label && n.tagName !== 'BODY'; n = n.parentElement) {
      for (let s = n.previousElementSibling; s && !label; s = s.previousElementSibling) if (/^H[1-6]$/.test(s.tagName)) label = collapse(s.textContent)
    }
    listings.push({ label, titles })
  }
  return listings
}

const countBy = (titles) => {
  const m = new Map()
  for (const t of titles) m.set(titleKey(t), (m.get(titleKey(t)) ?? 0) + 1)
  return m
}

/**
 * A site listing that prints a title more than once where its source listing prints it at most once.
 * Each site listing is compared with the source listing that shares most of its titles (none shared: with nothing,
 * so a title the source never shows twice cannot be shown twice here).
 */
export function listingDuplicates({ route, site, source }) {
  const findings = []
  // a source whose listing could not be read says nothing about how often it prints a title: no multiplicity is claimed against it
  if (!source.length) return findings
  site.forEach((listing, index) => {
    const here = countBy(listing.titles)
    let best = null
    let bestShared = -1
    for (const s of source) {
      const there = countBy(s.titles)
      const shared = [...here.keys()].filter((k) => there.has(k)).length
      if (shared > bestShared) {
        best = there
        bestShared = shared
      }
    }
    for (const [key, n] of here) {
      const was = best?.get(key) ?? 0
      if (n > 1 && was <= 1) findings.push({ kind: 'listing-duplicate', route, listing: listing.label || `listing ${index + 1}`, title: listing.titles.find((t) => titleKey(t) === key), siteCount: n, sourceCount: was })
    }
  })
  return findings
}

/** `examined` is the number of titles read on the site: a listing check over no listing proves nothing. */
export function auditListings({ route, siteHtml, sourceHtml }) {
  const site = extractListings(siteHtml)
  const source = extractListings(sourceHtml)
  const examined = site.reduce((n, l) => n + l.titles.length, 0)
  return { check: 'listing-duplicates', route, examined, siteListings: site.length, sourceListings: source.length, ...(site.length && !source.length ? { unmeasured: 'the source page has no listing that could be read' } : {}), findings: listingDuplicates({ route, site, source }) }
}

// ─────────────────────────────────────────────── category trees
const nameKey = (n) => titleKey(String(n ?? '').replace(/&amp;/g, '&'))

/**
 * Terms are `{ name, slug, parent }` (`parent` a name, a slug or null) on the site and `{ name, alias, parent }` on the
 * source. Findings: a name the site holds under more parents than the source does (a second copy of a tree), and a
 * term whose slug is not the source alias of the same name and parent.
 */
export function categoryTreeFindings({ site, source }) {
  const findings = []
  const group = (terms) => {
    const m = new Map()
    for (const t of terms) {
      const k = nameKey(t.name)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(t)
    }
    return m
  }
  const mine = group(site)
  const theirs = group(source)
  for (const [k, list] of mine) {
    const was = theirs.get(k) ?? []
    if (list.length > Math.max(was.length, 1)) {
      findings.push({ kind: 'category-tree', name: list[0].name, siteTerms: list.map((t) => `${t.slug ?? t.name} (parent ${t.parent ?? 'none'})`), sourceTerms: was.length })
    }
    if (list.length > Math.max(was.length, 1)) continue
    for (const t of list) {
      const peer = was.find((s) => nameKey(s.parent) === nameKey(t.parent)) ?? (was.length === 1 ? was[0] : null)
      if (peer?.alias && t.slug && peer.alias !== t.slug) findings.push({ kind: 'category-slug', name: t.name, siteSlug: t.slug, sourceAlias: peer.alias })
    }
  }
  return { check: 'category-trees', examined: site.length, findings }
}
