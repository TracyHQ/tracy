/**
 * The final check of sibling card texts (COO rule of 30/10/2026, spec TracyHQ/tracy#189), read from the served pages of
 * any CMS and framework: the cards of one repeated list (a row of children of one parent, alike in tag and class, each
 * with one heading) share one shape. A list is reported when its card bodies mix empty and written, differ by more than
 * `SHAPE_LIMITS` in sentence count or length, hold an exclamation mark, or (one body of a list of items) speak of
 * something other than their own title; and when one record (one card title) reads in a different shape in two lists
 * (a home block and the list page). Each such finding is a blocker (`build-blockers.mjs`, rule `sibling-copy-shape`).
 * A word the site spells two ways ("Personalised" beside "Personalized") is reported too (`spelling-variant`, major).
 * Pure: pages in, findings out.
 */
import { parse } from 'parse5'
import {
  SHAPE_LIMITS,
  shapeDrift,
  shapeOf,
  spellingVariants
} from 'website-opportunities/domain/sibling-copy-shape.mjs'

const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'nav', 'header', 'footer', 'form'])
const HEADINGS = new Set(['h2', 'h3', 'h4', 'h5', 'h6'])
/** A card is small; a block holding more words is a section, not a card of a list. */
const CARD_MAX_CHARS = 900
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
const headingsOf = (node) => walk(node).filter((n) => HEADINGS.has(n.tagName))
const inside = (node, stop, test) => {
  for (let at = node.parentNode; at && at !== stop; at = at.parentNode) if (test(at)) return true
  return false
}

/** The body words of a card: its paragraphs and description blocks, outside headings, links and buttons. */
function bodyOf(card) {
  const parts = []
  for (const n of walk(card)) {
    if (n.tagName !== 'p') continue
    if (inside(n, card, (a) => HEADINGS.has(a.tagName) || a.tagName === 'a' || a.tagName === 'button'))
      continue
    if (inside(n, card, (a) => a.tagName === 'p')) continue
    const words =
      elements(n).every((e) => e.tagName === 'a' || e.tagName === 'button') && elements(n).length > 0
    if (words && !kids(n).some((k) => k.nodeName === '#text' && k.value.trim())) continue
    const said = plain(n)
    if (said) parts.push(said)
  }
  return parts.join(' ')
}

/** A list of item cards: things named by a few words (an item, a feature), not offerings or people with long names. */
const itemTitle = (title) => title.split(/\s+/).length <= 4

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>}} input
 * @returns {Array<{kind: 'sibling-copy-shape', severity: 'blocker', page: string, reason: string, found: string,
 *   why: string}>}
 */
export function checkSiblingCopy({ pages }) {
  const out = []
  /** @type {Map<string, Array<{page: string, body: string}>>} one record's card bodies, by folded title */
  const records = new Map()
  /** @type {string[]} every heading and paragraph a visitor reads */
  const said = []
  for (const page of pages ?? []) {
    if (page.status !== undefined && page.status !== 200) continue
    const seen = new Set()
    const nodes = walk(parse(String(page.html ?? '')))
    for (const n of nodes)
      if (n.tagName === 'p' || HEADINGS.has(n.tagName) || n.tagName === 'h1') said.push(plain(n))
    for (const parent of nodes) {
      const row = elements(parent)
      if (row.length < 2) continue
      const sig = signature(row[0])
      if (!row.every((c) => signature(c) === sig)) continue
      const heads = row.map(headingsOf)
      if (!heads.every((h) => h.length === 1 && h[0].tagName === heads[0][0].tagName)) continue
      if (row.some((c) => [...plain(c)].length > CARD_MAX_CHARS)) continue
      const cards = row.map((c, i) => ({ title: plain(heads[i][0]), body: bodyOf(c) }))
      const items = cards.every((c) => itemTitle(c.title))
      for (const c of cards) {
        const key = c.title
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, ' ')
          .trim()
        if (key && c.body) records.set(key, [...(records.get(key) ?? []), { page: page.path, body: c.body }])
      }
      for (const drift of shapeDrift(cards, { items })) {
        const id = `${drift.reason}|${drift.found}`
        if (seen.has(id)) continue
        seen.add(id)
        out.push({
          kind: 'sibling-copy-shape',
          severity: 'blocker',
          page: page.path,
          reason: drift.reason,
          found: drift.found,
          why: `The cards of one list on ${page.path} do not share one text shape (${drift.reason})`
        })
      }
    }
  }
  // One record, one shape: its card bodies in every list that shows it stay within the sibling limits of each other.
  for (const [title, shown] of records) {
    const bodies = [...new Set(shown.map((s) => s.body))]
    if (bodies.length < 2) continue
    const shapes = bodies.map(shapeOf)
    const sentences = shapes.map((x) => x.sentences)
    const chars = shapes.map((x) => x.characters)
    if (
      Math.max(...sentences) - Math.min(...sentences) <= SHAPE_LIMITS.sentenceSpread &&
      Math.max(...chars) <= Math.min(...chars) * SHAPE_LIMITS.lengthRatio
    )
      continue
    out.push({
      kind: 'sibling-copy-shape',
      severity: 'blocker',
      page: shown[0].page,
      reason: 'record-shape',
      found: shown.map((s) => `${s.page}: ${s.body.slice(0, 60)}`).join('; '),
      why: `The card of ${title} reads in a different shape in two lists`
    })
  }
  for (const forms of spellingVariants(said))
    out.push({
      kind: 'spelling-variant',
      severity: 'major',
      page: '',
      reason: 'spelling-variant',
      found: forms.join(' / '),
      why: `The site spells one word two ways: ${forms.join(', ')}`
    })
  return out
}
