/**
 * The final check of offering cards' lines and info rows (COO rules, spec TracyHQ/tracy#189 round 9), read from the served
 * pages of any CMS and framework:
 *   1. no line under an offering's name only repeats the name ("Padel" under "Padel"): such a line is taken off;
 *   2. the cards of one list show one set of info-row labels: a label shown on one card and missing on another of the same
 *      list ("Level / Where" beside "Level" beside no row) is a mix.
 * Pure: pages and the brief in, findings out.
 */
import { parse } from 'parse5'
import { onlyNamesOffering } from 'website-opportunities/domain/offering-description.mjs'

const SKIPPED = new Set(['script', 'style', 'template', 'noscript', 'nav', 'header', 'footer'])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? ''
const tokens = (node) =>
  attr(node, 'class')
    .toLowerCase()
    .split(/[\s_-]+/)
    .filter(Boolean)
const hidden = (node) =>
  SKIPPED.has(node.tagName) ||
  node.attrs?.some((a) => a.name === 'hidden') ||
  attr(node, 'aria-hidden') === 'true' ||
  /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(node, 'style'))
const kids = (node) => (node.childNodes ?? []).filter((n) => !hidden(n))
const walk = (node) => [node, ...kids(node).flatMap(walk)]
const text = (node) => (node.nodeName === '#text' ? node.value : kids(node).map(text).join(' '))
const plain = (node) => text(node).replace(/\s+/g, ' ').trim()
const folded = (v) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const isHeading = (node) =>
  HEADINGS.has(node.tagName) ||
  tokens(node).some((t) => /^h[1-6]$/.test(t)) ||
  attr(node, 'role') === 'heading'
const within = (node, test, stop = null) => {
  for (let at = node.parentNode; at && at !== stop; at = at.parentNode) if (test(at)) return true
  return false
}

/** Words of a description: a paragraph, or a block whose class names it an intro, a summary or a description. */
const DESCRIBING = /^(?:intro|introtext|summary|description|excerpt|lead|subtitle|desc)$/
/** The label cell of a fact row: a term, a header cell, or a block whose class says title, label or term. */
const LABEL = /^(?:title|label|term|name|key)$/
const elements = (node) => kids(node).filter((n) => n.tagName)
/**
 * Whether a node is the label of a fact row: a term-like cell holding no heading and no link, of a few words, followed by
 * a sibling cell with words (its value).
 */
function isRowLabel(node) {
  if (!node.tagName || isHeading(node) || node.tagName === 'a') return false
  if (!['dt', 'th'].includes(node.tagName) && !tokens(node).some((t) => LABEL.test(t))) return false
  if (walk(node).some((n) => n !== node && (isHeading(n) || n.tagName === 'a'))) return false
  const words = plain(node)
  if (!words || [...words].length > 40) return false
  const siblings = node.parentNode ? elements(node.parentNode) : []
  const value = siblings[siblings.indexOf(node) + 1]
  return Boolean(value && plain(value))
}
/** Whether a node is the value cell of a fact row: the sibling right after a row label. */
function isRowValue(node) {
  const siblings = node.parentNode ? elements(node.parentNode) : []
  const at = siblings.indexOf(node)
  return at > 0 && isRowLabel(siblings[at - 1])
}

/** The offering a heading names, by its brief label (or a card name inside it), else null. */
function offeringOf(title, services) {
  const said = folded(plain(title))
  if (!said) return null
  return (
    services.find((s) => folded(s.label) === said) ??
    services.find((s) => said.length >= 4 && folded(s.label).startsWith(`${said} `)) ??
    null
  )
}

/** The card a title stands in: the highest ancestor holding no other heading. */
function cardOf(title) {
  let card = title
  while (card.parentNode && !['body', 'main', 'html'].includes(card.parentNode.tagName)) {
    if (walk(card.parentNode).filter(isHeading).length > 1) break
    card = card.parentNode
  }
  return card
}

/** The labels of a card's fact rows, in order, folded. */
function rowLabelsOf(card) {
  return [
    ...new Set(
      walk(card)
        .filter(isRowLabel)
        .map((n) => folded(plain(n)))
    )
  ]
}

/**
 * @param {{pages: Array<{path: string, status?: number, html: string}>, brief: any}} input
 * @returns {Array<{kind: string, severity: 'major', page: string, found: string, why: string}>}
 */
export function checkOfferingRows({ pages, brief }) {
  const services = (brief?.reading?.services ?? []).filter(
    (s) => typeof s?.label === 'string' && s.label.trim() && s.onSite !== false && s.reviewsOnly !== true
  )
  const out = []
  if (services.length === 0) return out
  for (const page of pages ?? []) {
    if (page.status !== undefined && page.status !== 200) continue
    const nodes = walk(parse(String(page.html ?? '')))
    // 1. A line only repeating an offering's name, wherever it stands (a card, an offering page's masthead).
    const reported = new Set()
    for (const n of nodes) {
      if (!n.tagName || isHeading(n) || n.tagName === 'a' || n.tagName === 'button') continue
      if (n.tagName !== 'p' && !tokens(n).some((t) => DESCRIBING.test(t))) continue
      if (within(n, (a) => isHeading(a) || a.tagName === 'a' || a.tagName === 'button')) continue
      if (isRowValue(n) || within(n, isRowValue)) continue
      const words = plain(n)
      const offering = services.find((s) => onlyNamesOffering(words, [s.label]))
      if (!offering || reported.has(folded(words))) continue
      reported.add(folded(words))
      out.push({
        kind: 'offering-name-only',
        severity: 'major',
        page: page.path,
        found: words,
        why: `A line under ${offering.label} only repeats its name on ${page.path}`
      })
    }
    // 2. The cards of one list: same set of row labels on each.
    const cards = []
    for (const title of nodes.filter(isHeading)) {
      if (!offeringOf(title, services)) continue
      const card = cardOf(title)
      if (!cards.some((c) => c.card === card))
        cards.push({ card, title: plain(title), labels: rowLabelsOf(card) })
    }
    const lists = new Map()
    for (const c of cards) {
      // A card's list is the nearest ancestor that also holds another offering card.
      let list = c.card.parentNode
      while (list && !cards.some((o) => o !== c && walk(list).includes(o.card))) list = list.parentNode
      if (!list) continue
      lists.set(list, [...(lists.get(list) ?? []), c])
    }
    for (const group of lists.values()) {
      if (group.length < 2 || group.every((c) => c.labels.length === 0)) continue
      const sets = new Set(group.map((c) => c.labels.join(' | ')))
      if (sets.size === 1) continue
      out.push({
        kind: 'offering-row-labels',
        severity: 'major',
        page: page.path,
        found: group.map((c) => `${c.title}: ${c.labels.join(', ') || 'no row'}`).join('; '),
        why: `The offering cards of one list on ${page.path} show different info-row labels`
      })
    }
  }
  return out
}
