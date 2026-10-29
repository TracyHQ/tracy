// C07 readback: surviving people cards need a visible, accepted name beside their avatar. Read the served HTML,
// not the planned pins: the CMS may have refused or a later cleanup may have emptied the name.
import { parse } from 'parse5'
import { showablePeopleOf } from 'website-opportunities/domain/brief-people.mjs'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value ?? null
const folded = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
const hidden = (node) =>
  ['script', 'style', 'template'].includes(node.tagName) ||
  attr(node, 'hidden') !== null ||
  attr(node, 'aria-hidden') === 'true' ||
  /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(node, 'style') ?? '')

function nodesOf(node) {
  if (hidden(node)) return []
  return [node, ...(node.childNodes ?? []).flatMap(nodesOf)]
}

const wordsOf = (node) =>
  hidden(node) ? '' : node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(wordsOf).join(' ')
const imagesOf = (node) => nodesOf(node).filter((n) => n.tagName === 'img' && attr(n, 'src')?.trim())
const personCard = (node) =>
  /(?:^|\s)(?:team|person|staff|member)[-_](?:item|card|member)(?:\s|$)/i.test(attr(node, 'class') ?? '') ||
  /(?:^|\/)Person$/.test(attr(node, 'itemtype') ?? '') ||
  attr(node, 'data-person-card') !== null
const nameField = (node) =>
  /^h[1-6]$/.test(node.tagName ?? '') ||
  attr(node, 'itemprop') === 'name' ||
  /(?:^|\s)(?:[\w-]+[-_])?(?:name|title)(?:\s|$)/i.test(attr(node, 'class') ?? '')

/** A repeated card without a semantic class: the largest subtree holding just this portrait, within its module. */
function imageCard(image, root) {
  let card = image
  while (card.parentNode && card.parentNode !== root && imagesOf(card.parentNode).length === 1)
    card = card.parentNode
  return nodesOf(card).some(nameField) ? card : null
}

/** Static readback for Joomla T3/T4 modules and semantic Person/team cards, including WordPress blocks. */
export function peopleCardFindings({ pages, contentMap, brief }) {
  const entities = new Set(
    (contentMap?.slots ?? []).filter((s) => s.role === 'person.image').map((s) => s.entity)
  )
  if (entities.size === 0) return []
  const accepted = new Set(showablePeopleOf(brief).map((p) => folded(p.label)))
  const findings = []
  for (const page of pages) {
    if ((page.status ?? 200) !== 200) continue
    const nodes = nodesOf(parse(page.html))
    const roots = nodes.filter((node) => {
      const id = attr(node, 'id') ?? ''
      return (
        entities.has(`module-${/^mod-?(\d+)$/i.exec(id)?.[1]}`) ||
        entities.has(`module-${attr(node, 'data-module-id')}`)
      )
    })
    const cards = new Set()
    for (const root of roots) {
      const semantic = nodesOf(root).filter(personCard)
      for (const card of semantic.length ? semantic : imagesOf(root).map((image) => imageCard(image, root)))
        if (card) cards.add(card)
    }
    // CMSs whose cards are blocks rather than modules expose the same Person/team semantics.
    if (roots.length === 0) for (const node of nodes.filter(personCard)) cards.add(node)
    let index = 0
    for (const card of cards) {
      const names = nodesOf(card)
        .filter(nameField)
        .map((node) => folded(wordsOf(node)))
      const hasName = names.some((name) => name !== '' && accepted.has(name))
      const hasAvatar = imagesOf(card).length > 0
      // Native record cleanup can leave an empty repeated-list shell; it no longer shows a person.
      if (!hasAvatar && folded(wordsOf(card)) === '') continue
      if (!hasName || !hasAvatar)
        findings.push({
          kind: 'C07',
          page: page.path,
          place: `person-card:${index}`,
          found: !hasName
            ? 'person card has no accepted visible name beside its avatar'
            : 'person card has no avatar beside its name'
        })
      index += 1
    }
  }
  return findings
}
