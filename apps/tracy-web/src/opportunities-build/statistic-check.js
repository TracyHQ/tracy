// C17 readback: the number, label and attribution must belong to the same accepted statistic, after every writer.
import { parse } from 'parse5'
import { statFactsOf } from 'website-opportunities/domain/stat-box-plan.mjs'

const attr = (node, key) => node.attrs?.find((a) => a.name === key)?.value
const hidden = (node) =>
  /^(script|style|template|noscript)$/.test(node.tagName ?? '') ||
  attr(node, 'hidden') !== undefined ||
  attr(node, 'aria-hidden') === 'true' ||
  /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(node, 'style') ?? '')
const walk = (node) => (hidden(node) ? [] : [node, ...(node.childNodes ?? []).flatMap(walk)])
const words = (node) =>
  hidden(node) ? '' : node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(words).join(' ')
const fold = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const plain = (node) => words(node).replace(/\s+/g, ' ').trim()
const classes = (node) => attr(node, 'class') ?? ''
const valueNode = (node) =>
  attr(node, 'data-slot-role') === 'stat.value' ||
  attr(node, 'data-stat-value') !== undefined ||
  /(?:^|\s)(?:(?:stat|stats|statistic|counter)[-_](?:value|number|count)|number|count|counter)(?:\s|$)/i.test(
    classes(node)
  )
const cardNode = (node) =>
  attr(node, 'data-stat-card') !== undefined ||
  /(?:^|\s)(?:stat|stats|statistic|counter)[-_](?:item|card)(?:\s|$)/i.test(classes(node))
// A statistic tile by its own class word (`gallery-statics`, `stats`, `counter`), even when the writer left it empty.
const tileNode = (node) =>
  cardNode(node) ||
  classes(node)
    .split(/\s+/)
    .some((c) => /(?:^|[-_])(?:stat|stats|statics|statistic|statistics|counter|counters)$/i.test(c))
const numbers = (value) =>
  String(value)
    .replace(/(?<=\d)[,\s\u00a0\u202f](?=\d{3}(?:\D|$))/g, '')
    .match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?/g) ?? []

/** A value's own repeated item; a neighbouring tile's number or label can never satisfy it. */
function cardOf(value, root) {
  let card = value.parentNode ?? value
  while (
    card.parentNode &&
    card.parentNode !== root &&
    !cardNode(card) &&
    !/^(?:body|main|html)$/.test(card.parentNode.tagName ?? '') &&
    walk(card.parentNode).filter(valueNode).length === 1
  )
    card = card.parentNode
  return card
}

/** T3/T4 module values, WordPress/EmDash semantic statistic cards and role-marked slots share one tuple check. */
export function statisticFindings({ pages, contentMap, brief }) {
  const facts = statFactsOf(brief)
  const forms = facts.flatMap((f) => [f, f.short].filter(Boolean))
  const entities = new Set(
    (contentMap?.slots ?? []).filter((s) => s.role === 'stat.value').map((s) => s.entity)
  )
  const out = []
  for (const page of pages) {
    if ((page.status ?? 200) !== 200) continue
    const nodes = walk(parse(String(page.html ?? '')))
    const roots = nodes.filter(
      (n) =>
        entities.has(`module-${/^mod-?(\d+)$/i.exec(attr(n, 'id') ?? '')?.[1]}`) ||
        entities.has(`module-${attr(n, 'data-module-id')}`)
    )
    const cards = new Map()
    for (const root of roots)
      for (const node of walk(root).filter(valueNode)) cards.set(cardOf(node, root), node)
    for (const card of nodes.filter(cardNode)) cards.set(card, walk(card).find(valueNode) ?? null)
    // Semantic value classes identify non-Joomla counters, including blocks without a card wrapper class.
    for (const node of nodes.filter((n) => valueNode(n) && /(?:stat|counter)/i.test(classes(n))))
      if (![...cards.values()].includes(node)) cards.set(cardOf(node, null), node)
    // 🔒 A TILE WITHOUT A REAL NUMBER IS TAKEN OFF (COO, item 10): an emptied tile left standing is a finding too.
    const empty = nodes.filter((n) => tileNode(n) && !plain(n) && !cards.has(n))
    for (const node of empty)
      if (!empty.some((outer) => outer !== node && walk(outer).includes(node))) cards.set(node, null)
    let index = 0
    for (const [card, value] of cards) {
      const said = plain(card)
      const actual = value ? numbers(plain(value)) : []
      const matching = forms.some(
        (f) =>
          actual.length === 1 &&
          actual[0] === f.value &&
          fold(said).includes(fold(f.label)) &&
          (!f.platform || fold(said).includes(fold(f.platform)))
      )
      if (!matching)
        out.push({
          kind: 'C17',
          severity: 'major',
          page: page.path,
          place: `statistic:${index}`,
          found: said ? said.slice(0, 180) : '(empty statistic tile)',
          why: 'Statistic tile has no accepted numeric value with its matching label and source; replace the whole tuple or take off the tile.'
        })
      index += 1
    }
  }
  return out
}
