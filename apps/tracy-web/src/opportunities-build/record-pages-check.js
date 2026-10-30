/**
 * The final check of sibling record pages (spec TracyHQ/tracy#189, site build rules 1 to 3), read from the served pages
 * of any CMS and framework. Record pages are the pages of one kind of record (a lesson, a service, a product) laid out
 * alike: under one parent address, with the same run of three or more sections. Of each such family it reports
 *   - `sibling-record-picture`: the same picture in the same section of two record pages (a swimming page showing the
 *     tennis court of its sibling); a picture belongs to its own record;
 *   - `sibling-record-copy`: a section whose sentences, once the record's name is taken out, are mostly the sentences of
 *     the same section on a sibling page (one template with the name swapped);
 *   - `record-page-pager`: a blog pager (Previous / Next article) on a record page laid out as a landing page.
 * And on every page, `empty-card`: a card of a row left with an empty title or empty bullets beside written siblings.
 * Each is a blocker (`build-blockers.mjs`, rule `sibling-record-pages`). Pure: pages in, findings out.
 */
import { parse } from 'parse5'

const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'header', 'footer'])
const HEADINGS = new Set(['h2', 'h3', 'h4', 'h5', 'h6'])
/** A family of record pages has at least this many sections in the same order. */
const MIN_SECTIONS = 3
/** Two sections are one template when this share of the shorter one's sentences is the other's. */
const SHARED_SHARE = 0.6
/** Words that make a sentence worth comparing. */
const MIN_SENTENCE_WORDS = 4
/** A pager as the CMSs render it: Joomla's pagenavigation, WordPress's post navigation, a rel prev/next pair. */
const PAGER =
  /class\s*=\s*["'][^"']*\b(?:pagenavigation|pagenav|pager|post-navigation|nav-links|navigation\s+post)\b[^"']*["']/i

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const hidden = (node) =>
  SKIPPED.has(node.tagName) ||
  node.attrs?.some((a) => a.name === 'hidden') ||
  attr(node, 'aria-hidden') === 'true' ||
  /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(node, 'style'))
const kids = (node) => (node.childNodes ?? []).filter((n) => !hidden(n))
const elements = (node) => kids(node).filter((n) => n.tagName)
const walk = (node) => [node, ...kids(node).flatMap(walk)]
const text = (node) => (node.nodeName === '#text' ? node.value : kids(node).map(text).join(' '))
const plain = (node) => text(node).replace(/\s+/g, ' ').trim()
const signature = (node) => `${node.tagName}.${attr(node, 'class').trim().split(/\s+/).sort().join('.')}`
const parentPath = (path) => String(path).replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/'

/** The sections of a page: for each h2, the widest block around it that holds no other h2. */
function sectionsOf(root) {
  const h2s = walk(root).filter((n) => n.tagName === 'h2')
  const count = (node) => walk(node).filter((n) => n.tagName === 'h2').length
  return h2s.map((h2) => {
    let at = h2
    while (at.parentNode?.tagName && count(at.parentNode) === 1) at = at.parentNode
    return at
  })
}

/** The sentences of a section, lower case, with the record's own name words taken out. */
function sentencesOf(node, nameWords) {
  return new Set(
    walk(node)
      .filter((n) => n.tagName === 'p' || n.tagName === 'li')
      .flatMap((n) => plain(n).split(/(?<=[.!?])\s+/))
      .map((s) =>
        s
          .toLowerCase()
          .split(/[^\p{L}\p{N}]+/u)
          .filter((w) => w && !nameWords.has(w))
          .join(' ')
      )
      .filter((s) => s.split(' ').length >= MIN_SENTENCE_WORDS)
  )
}

/** The photos of a section: their addresses, icons and vector marks left out. */
const photosOf = (node) =>
  walk(node)
    .filter((n) => n.tagName === 'img')
    .map((n) => attr(n, 'src').split('?')[0])
    .filter((src) => src && !/\.(?:svg|png|gif)$/i.test(src) && !/icon/i.test(src))

/** The cards of a row left empty beside written siblings: an empty title, or bullets with no words. */
function emptyCards(root) {
  const out = []
  for (const parent of walk(root)) {
    const row = elements(parent)
    if (row.length < 2 || new Set(row.map(signature)).size !== 1) continue
    const state = row.map((card) => {
      const titles = walk(card).filter((n) => HEADINGS.has(n.tagName))
      const items = walk(card).filter((n) => n.tagName === 'li')
      return {
        titled: titles.length > 0 && titles.every((h) => plain(h)),
        emptyTitle: titles.some((h) => !plain(h)),
        emptyItems: items.length > 0 && items.every((li) => !plain(li)),
        written: Boolean(plain(card))
      }
    })
    if (!state.some((s) => s.titled && s.written)) continue
    state.forEach((s, i) => {
      if (s.emptyTitle || s.emptyItems) out.push({ card: i, row: signature(row[i]) })
    })
  }
  return out
}

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>}} input
 * @returns {Array<{kind: string, severity: 'blocker', page: string, reason: string, found: string, why: string}>}
 */
export function checkRecordPages({ pages }) {
  const out = []
  const read = []
  for (const page of pages ?? []) {
    if (page.status !== undefined && page.status !== 200) continue
    const root = parse(String(page.html ?? ''))
    const h1 = walk(root).find((n) => n.tagName === 'h1')
    const nameWords = new Set(
      (h1 ? plain(h1) : '')
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter(Boolean)
    )
    const sections = sectionsOf(root)
    for (const empty of emptyCards(root))
      out.push({
        kind: 'empty-card',
        severity: 'blocker',
        page: page.path,
        reason: 'empty-card',
        found: empty.row,
        why: `A card of a row is left with an empty title or empty bullets beside written cards: card ${empty.card + 1} of ${empty.row}`
      })
    read.push({ page, sections, nameWords, html: String(page.html ?? '') })
  }
  // A family: the pages under one parent address whose sections run in the same order.
  const families = new Map()
  for (const r of read) {
    if (r.sections.length < MIN_SECTIONS) continue
    const key = `${parentPath(r.page.path)}|${r.sections.map(signature).join('>')}`
    families.set(key, [...(families.get(key) ?? []), r])
  }
  for (const family of families.values()) {
    if (family.length < 2) continue
    for (const r of family)
      if (PAGER.test(r.html))
        out.push({
          kind: 'record-page-pager',
          severity: 'blocker',
          page: r.page.path,
          reason: 'blog-pager-on-landing-page',
          found: 'Previous / Next article',
          why: 'A record page laid out as a landing page shows the blog pager (Previous / Next article)'
        })
    family.forEach((a, i) => {
      for (const b of family.slice(i + 1))
        a.sections.forEach((section, at) => {
          const other = b.sections[at]
          const shared = photosOf(section).filter((src) => photosOf(other).includes(src))
          for (const src of new Set(shared))
            out.push({
              kind: 'sibling-record-picture',
              severity: 'blocker',
              page: b.page.path,
              reason: 'same-picture-as-sibling',
              found: src,
              why: `Section ${at + 1} shows the same picture as on ${a.page.path}: a picture belongs to its own record`
            })
          const mine = sentencesOf(section, a.nameWords)
          const theirs = sentencesOf(other, b.nameWords)
          const same = [...mine].filter((s) => theirs.has(s))
          const smaller = Math.min(mine.size, theirs.size)
          if (same.length >= 2 && smaller > 0 && same.length / smaller >= SHARED_SHARE)
            out.push({
              kind: 'sibling-record-copy',
              severity: 'blocker',
              page: b.page.path,
              reason: 'section-copied-from-sibling',
              found: same[0],
              why: `Section ${at + 1} says what the same section of ${a.page.path} says with only the name changed (${same.length} of ${smaller} sentences)`
            })
        })
    })
  }
  return out
}
