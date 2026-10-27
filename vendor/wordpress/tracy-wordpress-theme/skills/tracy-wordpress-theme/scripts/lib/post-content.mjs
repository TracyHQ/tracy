// post-content.mjs — what a seeded post carries besides its body, read from the source instead
// of invented: the date its byline printed (`post_date`), the category its eyebrow named, the
// lead paragraph as `post_excerpt`, and a body that does not repeat what `single.html` already
// prints. A design export puts the whole article header in the page — eyebrow, h1, lead, author
// line with share glyphs, hero image — and the WordPress template prints title, date, category
// and featured image itself, so a body seeded verbatim showed every one of them twice, and the
// auto-excerpt (the first 55 words of the body) began with the eyebrow and the title. Used by
// seed.mjs on the spec it is given, and by ingest/from-html.mjs when it writes the spec — the
// same reading either way, so an older spec-pack seeds the same as a fresh one.
import { JSDOM } from 'jsdom'
import { parseBlocks, serializeBlocks } from './block-fill.mjs'

const dom = new JSDOM('')
const { document } = dom.window

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  // Russian, nominative and genitive
  янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, сент: 9, окт: 10, ноя: 11, дек: 12,
  января: 1, февраля: 2, марта: 3, апреля: 4, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12,
  январь: 1, февраль: 2, март: 3, апрель: 4, июнь: 6, июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12
}
const monthOf = (word) => MONTHS[String(word).toLowerCase().replace(/\.$/, '')] ?? null
const stamp = (y, m, d) => {
  if (!m || d < 1 || d > 31 || y < 1970 || y > 2100) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')} 00:00:00`
}

/**
 * The date a byline or a card meta line prints, as WordPress takes `post_date`
 * (`YYYY-MM-DD 00:00:00`), or null. "28 Jul 2026", "12 August 2026", "August 12, 2026",
 * "28.07.2026", "12 августа 2026", "2026-06-19" — the segment can sit between other segments
 * ("Head of Structures · 28 Jul 2026 · 7 min read"). A bare year is not a date.
 */
export function parseDateText(text) {
  const s = String(text ?? '')
  if (!s.trim()) return null
  let m = /(?<!\d)(\d{1,2})\s+(\p{L}{3,})\.?\s+(\d{4})(?!\d)/u.exec(s)
  if (m && monthOf(m[2])) return stamp(Number(m[3]), monthOf(m[2]), Number(m[1]))
  m = /(\p{L}{3,})\.?\s+(\d{1,2}),?\s+(\d{4})(?!\d)/u.exec(s)
  if (m && monthOf(m[1])) return stamp(Number(m[3]), monthOf(m[1]), Number(m[2]))
  m = /(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/.exec(s)
  if (m) return stamp(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(s)
  if (m) return stamp(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/**
 * Dates for a list of posts in source order: a dated post keeps its date; an undated one is
 * placed one day before the earliest dated post so far, then one day earlier for each further
 * undated post — the listing keeps the source's order, and a second run computes the same
 * dates (a `now` would not). With no dated post at all nothing is invented: null.
 */
export function scheduleDates(posts) {
  const dated = posts.map((p) => p.date ?? null).filter(Boolean)
  if (!dated.length) return posts.map(() => null)
  let cursor = new Date(dated.sort()[0].replace(' ', 'T') + 'Z')
  return posts.map((p) => {
    if (p.date) return p.date
    cursor = new Date(cursor.getTime() - 86400000)
    return `${cursor.toISOString().slice(0, 10)} 00:00:00`
  })
}

/**
 * Dates made DISTINCT without reordering what the source orders: posts that share one date get
 * one second each, the first in source order the latest, so a listing that sorts by date
 * (`orderBy date`, newest first — WordPress's default) shows them in source order on EVERY
 * request. Measured 25/09 on Tracy Base wp7: 51/51 posts carried `2021-09-14 00:00:00`, MySQL
 * returned ties in whatever order it liked, and 9/38 pages served different HTML to consecutive
 * plain requests on an unchanged database — visual findings on them flipped with no code change.
 *
 * Deterministic (same input, same output — the seeder's second run stays `+0 ~0`), the calendar
 * day is kept (seconds are added within the day; a group that would cross midnight counts back
 * from the date instead), and null stays null. Returns `{ dates, tied }` — `tied` is how many
 * posts shared a date with another.
 */
export function distinctDates(dates) {
  const groups = new Map()
  dates.forEach((d, i) => {
    if (!d) return
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push(i)
  })
  const out = [...dates]
  let tied = 0
  const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
  for (const [d, idx] of groups) {
    if (idx.length < 2) continue
    tied += idx.length
    const base = Date.parse(d.replace(' ', 'T') + 'Z')
    if (Number.isNaN(base)) continue
    const n = idx.length
    const dayEnd = base - (base % 86400000) + 86399000
    const forward = base + (n - 1) * 1000 <= dayEnd
    idx.forEach((i, k) => {
      out[i] = forward ? fmt(base + (n - 1 - k) * 1000) : fmt(base - k * 1000)
    })
  }
  return { dates: out, tied }
}

/**
 * The category an eyebrow names: "Engineering", "Featured · Disclosure" → "Disclosure" (the
 * prefix is the card's placement, not its category). A date, a number or an empty string is
 * not a category.
 */
export function categoryLabel(eyebrow) {
  const parts = String(eyebrow ?? '')
    .split(/\s*[·•|/]\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  const label = parts[parts.length - 1] ?? ''
  if (!label || /\d/.test(label) || !/\p{L}/u.test(label)) return null
  return label
}

const text = (el) => el.textContent.replace(/\s+/g, ' ').trim()
const stripHtml = (html) =>
  String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const key = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
/**
 * What an image reference names when the caller has no image table: its URL path without query,
 * fragment or leading slash (`/images/a/x.jpg?v=1` and `images/a/x.jpg` are one file). Never the
 * file name alone: `intro/item-1.jpg` and `detail/item-1.jpg` are two pictures (JA Vega M6-8).
 */
const urlIdentity = (ref) => String(ref ?? '').split('#')[0].split('?')[0].replace(/^\/+/, '') || null
const EYEBROW_MAX = 40
/** Blocks scanned from the top for the head — the export's header is five; the sixth is body. */
const HEAD_BLOCKS = 6

/**
 * Split the article header a design export puts in the body from the body itself. The head is
 * scanned block by block from the top and stops at the first block that is body: an eyebrow (a
 * short core/html with no image and no digits), the h1 that repeats `title`, the first
 * paragraph (the lead — returned as `lead`, the post's excerpt, which the single template
 * prints as the lede), a byline (a core/html that carries `dateText`), and an image block
 * whose only content is `featuredImage`. Returns the new markup, the eyebrow and lead texts,
 * and what was removed, in order (the lead listed after the title when it went).
 *
 * `imageId(ref)` says which file a reference names (the seeder's imageIdentity, which reads the
 * post's image table); the default is the URL path. A picture is the featured one only when both
 * identities are known and equal — an identity that cannot be told (null) keeps the picture.
 */
export function articleHead({ content, title = null, featuredImage = null, dateText = null, dropLead = false, imageId = urlIdentity } = {}) {
  const markup = String(content ?? '')
  const out = { content: markup, eyebrow: null, lead: null, author: null, removed: [] }
  if (!markup.trim()) return out
  const blocks = parseBlocks(markup)
  const featured = featuredImage ? imageId(featuredImage) : null
  const isFeatured = (src) => Boolean(featured && src != null && imageId(src) === featured)
  const date = dateText ? key(dateText) : null
  const drop = new Set()
  let leadBlock = null
  let seen = 0
  for (const block of blocks) {
    if (block.name === null) continue // whitespace between blocks
    if (++seen > HEAD_BLOCKS) break
    const inner = block.innerContent.join('')
    const plain = stripHtml(inner)
    if (block.name === 'core/heading') {
      // The h1 is the head whether or not it repeats the title; a lower heading is the body.
      if ((block.attrs.level ?? 2) !== 1) break
      if (title && key(plain) === key(title)) {
        drop.add(block)
        out.removed.push('title')
      }
      continue
    }
    if (block.name === 'core/paragraph' && !leadBlock) {
      leadBlock = block
      out.lead = plain || null
      continue
    }
    if (block.name === 'core/image') {
      // Parsed, not matched: a single-quoted or upper-case src is the same picture.
      const tpl = document.createElement('template')
      tpl.innerHTML = inner
      if (isFeatured(tpl.content.querySelector('img')?.getAttribute('src') ?? null)) {
        drop.add(block)
        out.removed.push('featured-image')
        continue
      }
      break
    }
    if (block.name === 'core/html') {
      const tpl = document.createElement('template')
      tpl.innerHTML = inner
      const imgs = [...tpl.content.querySelectorAll('img')]
      if (imgs.length === 1 && !plain && isFeatured(imgs[0].getAttribute('src'))) {
        drop.add(block)
        out.removed.push('featured-image')
        continue
      }
      if (!imgs.length && !out.eyebrow && !leadBlock && plain && plain.length <= EYEBROW_MAX && !/\d/.test(plain)) {
        out.eyebrow = plain
        drop.add(block)
        out.removed.push('eyebrow')
        continue
      }
      if (date && !imgs.length && key(plain).includes(date)) {
        out.author = bylineAuthor(tpl.content, dateText)
        drop.add(block)
        out.removed.push('byline')
        continue
      }
      break
    }
    break
  }
  // The lead is the excerpt, and the single template prints the excerpt as the lede — so it
  // leaves the body when the body had a header around it (a design export), or when the post
  // is a listing-card stub whose body is that one paragraph (`dropLead`). A post that is only
  // paragraphs (a CMS article) keeps its first one: its template may not print the excerpt.
  if (leadBlock && out.lead && (dropLead || out.removed.length)) {
    drop.add(leadBlock)
    out.removed.splice(out.removed.indexOf('title') + 1 || out.removed.length, 0, 'lead')
  }
  const kept = blocks.filter((b) => !drop.has(b))
  out.content = serializeBlocks(kept).replace(/\n\s*\n/g, '\n').trim()
  return out
}

/**
 * A page body without the breadcrumb row the source drew at its top — "Home / Marketing Kit /
 * Form" as a core/html of links and separators — which the theme's template prints itself, so
 * the page showed two. Only a FIRST block that is a crumb goes: short (≤ 120 chars), at least
 * one link, two or more separators (/ › »), no heading, no image. `{ content, removed }`.
 */
export function stripSourceBreadcrumb(content) {
  const markup = String(content ?? '')
  const blocks = parseBlocks(markup)
  const first = blocks.find((b) => b.name !== null)
  if (!first || first.name !== 'core/html') return { content: markup, removed: false }
  const inner = first.innerContent.join('')
  const plain = stripHtml(inner)
  const seps = (plain.match(/[/›»]/g) ?? []).length
  const crumb = plain.length <= 120 && seps >= 2 && /<a\s/.test(inner) && !/<(h[1-6]|img)\b/.test(inner)
  if (!crumb) return { content: markup, removed: false }
  return { content: serializeBlocks(blocks.filter((b) => b !== first)).replace(/^\s+/, '').replace(/\n\s*\n/g, '\n').trim(), removed: true }
}

/**
 * Who a byline names: `{ name, role }` — the name is the short leaf text (no digit, ≤ 40
 * chars, at least two words) standing before the meta line that carries the date; the role is
 * the meta line's first ` · ` part when it is words, not a date or a read time ("Head of
 * Structures · 28 Jul 2026 · 7 min read", "Начальник отдела КЖ/КМ · 28.07.2026 · 7 мин чтения").
 * Null when the byline has neither — the seeder then keeps the site's editorial author.
 */
function bylineAuthor(root, dateText) {
  const meta = key(dateText ?? '')
  const leaves = [...root.querySelectorAll('*')].filter((e) => !e.children.length || [...e.children].every((c) => c.tagName === 'BR' || c.tagName === 'SPAN'))
  const texts = leaves.map(text).filter(Boolean)
  const at = texts.findIndex((t) => meta && key(t).includes(meta))
  const before = at > 0 ? texts.slice(0, at) : []
  const name = before.reverse().find((t) => t.length <= 40 && !/\d/.test(t) && t.split(/\s+/).length >= 2 && !t.includes('·')) ?? null
  const first = String(dateText ?? '').split(/\s+[·•|]\s+/)[0].trim()
  const role = first && !/\d/.test(first) && first.length <= 60 && !parseDateText(first) ? first : null
  return name || role ? { name, role } : null
}

const cardLeaves = (card) => [...card.querySelectorAll('*')].filter((e) => !e.children.length || [...e.children].every((c) => c.tagName === 'BR' || c.tagName === 'SPAN'))

/**
 * The eyebrow of a listing card: a short leaf text before its heading with no digit in it
 * ("Engineering", "Featured · Disclosure") — the card extractor reads title, text and meta,
 * not this. Null when the card has none.
 */
export function cardEyebrow(card) {
  const h = card.querySelector('h1, h2, h3, h4')
  if (!h) return null
  const before = cardLeaves(card).filter((e) => e.compareDocumentPosition(h) & 4 && !h.contains(e))
  return before.map(text).find((t) => t && t.length <= EYEBROW_MAX && !/\d/.test(t)) ?? null
}

/**
 * The listing cards of a spec-pack's sections, by lowercased title: `{ eyebrow, text,
 * dateText }` — the eyebrow (a short leaf before the heading), the excerpt (the card's
 * paragraph) and the meta line (a short leaf with a year) that the card extractor
 * (`html-content.mjs itemOf`) reads into title/text/meta but not by these names. An
 * `<article>` with a heading is a card; the first one per title wins a field, later ones fill
 * the fields it lacks — cards of a section on one of `listingPaths` (the posts page, a category
 * archive) come first.
 */
export function sourceCards(sections, { listingPaths = new Set() } = {}) {
  const cards = new Map()
  const all = [...(sections?.custom ?? []), ...(sections?.acm ?? []), ...(sections?.other ?? [])]
  // The listing page's cards first: its excerpt is the one the archive prints; a home-page
  // teaser of the same post may word it differently and only fills what the listing lacks.
  const onListing = (s) => (s.pages ?? []).some((p) => listingPaths.has(p.wpPath ?? p.path))
  all.sort((a, b) => Number(onListing(b)) - Number(onListing(a)))
  for (const s of all) {
    if (!s?.html) continue
    const tpl = document.createElement('template')
    tpl.innerHTML = s.html
    for (const a of tpl.content.querySelectorAll('article')) {
      const h = a.querySelector('h1, h2, h3, h4')
      if (!h || a.querySelector('article')) continue
      const title = key(text(h))
      if (!title) continue
      const eyebrow = cardEyebrow(a)
      const p = a.querySelector('p')
      const dateText = cardLeaves(a).map(text).find((t) => t && t.length <= 80 && parseDateText(t)) ?? null
      // The same post is a card on several pages (home, the listing); the first card gives the
      // text, and a later one fills what it lacked — the home teaser has no eyebrow, the listing has.
      const have = cards.get(title) ?? { eyebrow: null, text: null, dateText: null }
      cards.set(title, { eyebrow: have.eyebrow ?? eyebrow, text: have.text ?? (p ? text(p) : null), dateText: have.dateText ?? dateText })
    }
  }
  return cards
}

const TAGS_RE = /^(tags?|теги|метки|ключевые слова)\s*:/i
const PREV_NEXT_RE = /(^|\s)(←|→|previous|next|назад|далее|предыдущ|следующ)(\s|$)/i
const RELATED_RE = /related|see also|read next|more (articles|news)|похож|читайте также|ещё по теме|еще по теме/i

/**
 * The tail a design export puts after the article body — a tags row, a previous/next pair, a
 * related-articles block — read from the end and removed: the tags become the post's tags
 * (`tags`), and the template prints the post's own tags, navigation and related posts.
 * Returns the new markup, the tag names, and what was removed (from the end inwards).
 */
export function articleTail({ content } = {}) {
  const markup = String(content ?? '')
  const out = { content: markup, tags: [], removed: [] }
  if (!markup.trim()) return out
  const blocks = parseBlocks(markup)
  const real = blocks.filter((b) => b.name !== null)
  const drop = new Set()
  for (const block of real.slice(-3).reverse()) {
    if (block.name !== 'core/html') break
    const inner = block.innerContent.join('')
    const tpl = document.createElement('template')
    tpl.innerHTML = inner
    const plain = stripHtml(inner)
    const anchors = [...tpl.content.querySelectorAll('a')]
    const heading = tpl.content.querySelector('h1, h2, h3, h4')
    const articles = tpl.content.querySelectorAll('article').length
    if (TAGS_RE.test(plain) && anchors.length) {
      out.tags = anchors.map(text).filter(Boolean)
      drop.add(block)
      out.removed.push('tags')
      continue
    }
    if ((heading && RELATED_RE.test(text(heading))) || articles >= 2) {
      drop.add(block)
      out.removed.push('related')
      continue
    }
    if (anchors.length === 2 && !heading && PREV_NEXT_RE.test(plain) && plain.length <= 240) {
      drop.add(block)
      out.removed.push('prev-next')
      continue
    }
    break
  }
  if (!drop.size) return out
  out.content = serializeBlocks(blocks.filter((b) => !drop.has(b))).replace(/\n\s*\n/g, '\n').trim()
  return out
}

/** A listing card whose eyebrow says "Featured" (or its Russian) is the sticky post of the listing. */
export const isFeatured = (eyebrow) => /^(featured|главное|главная новость|избранное)(?=[\s·•|:]|$)/iu.test(String(eyebrow ?? '').trim())

const TOC_LABEL_RE = /^(in this article|on this page|contents|table of contents|в этой статье|в статье|содержание|оглавление)$/i

/**
 * The table of contents the source drew beside an article, by source file: `Map(file →
 * [label, …])` — the link texts of the sidebar box whose label says "In this article" (or its
 * Russian). The design writes a SHORT label per section ("Catalogue dynamic loads") where the
 * body's heading is a full sentence ("1. Taking dynamic loads from the catalogue instead of
 * measuring them"); a TOC built from the headings alone wraps every entry onto two lines. The
 * seeder stores the labels as post meta (`tracy_toc`, in heading order) for the theme's TOC to
 * print instead of the headings. A page with no such box, or a box with no links, is absent.
 */
export function sourceTocs(sections) {
  const out = new Map()
  const all = [...(sections?.custom ?? []), ...(sections?.acm ?? []), ...(sections?.other ?? [])]
  for (const s of all) {
    if (!s?.html || !/<aside\b/i.test(s.html)) continue
    const tpl = document.createElement('template')
    tpl.innerHTML = s.html
    for (const aside of tpl.content.querySelectorAll('aside')) {
      const boxes = [...aside.querySelectorAll('*')].filter((e) => TOC_LABEL_RE.test(text(e)) && e.querySelectorAll('a').length === 0)
      for (const l of boxes) {
        // The box is the nearest ancestor that holds links; its links, in order, are the entries.
        let box = l.parentElement
        while (box && box !== aside && !box.querySelector('a')) box = box.parentElement
        const labels = box ? [...box.querySelectorAll('a')].map(text).filter(Boolean) : []
        if (!labels.length) continue
        for (const p of s.pages ?? []) if (p.file && !out.has(p.file)) out.set(p.file, labels)
      }
    }
  }
  return out
}
