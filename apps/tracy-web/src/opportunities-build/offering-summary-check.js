/** Read each offering card independently after all writes and cleanup, for every CMS and framework. */
import { parse } from 'parse5'

const headings = /^h[2-6]$/
const skipped = new Set(['script', 'style', 'template', 'noscript', 'nav', 'footer'])
const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value
const isHeading = (node) =>
  headings.test(node.tagName ?? '') ||
  /(?:^|\s)h[2-6](?:\s|$)/i.test(attr(node, 'class') ?? '') ||
  attr(node, 'role') === 'heading'
const hidden = (node) =>
  skipped.has(node.tagName) ||
  attr(node, 'hidden') !== undefined ||
  attr(node, 'aria-hidden') === 'true' ||
  /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attr(node, 'style') ?? '')
const children = (node) => (node.childNodes ?? []).filter((n) => !hidden(n))
const text = (node) => (node.nodeName === '#text' ? node.value : children(node).map(text).join(' '))
const plain = (node) => text(node).replace(/\s+/g, ' ').trim()
const folded = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
const walk = (node) => [node, ...children(node).flatMap(walk)]

/** @param {{pages: any[], brief: any}} input */
export function checkOfferingSummaries({ pages, brief }) {
  const services = (brief?.reading?.services ?? []).filter(
    (s) => s?.label && s.onSite !== false && s.reviewsOnly !== true
  )
  const out = []
  for (const page of pages) {
    if (page.status >= 400) continue
    const nodes = walk(parse(String(page.html ?? '')))
    const titles = nodes.filter(isHeading)
    for (const title of titles) {
      const offering = services.find((s) => folded(s.label) === folded(plain(title)))
      if (!offering) continue
      let card = title.parentNode
      // Never climb into the next card or borrow its paragraph. Lists, modules and article cards share this boundary.
      while (card?.parentNode && !['article', 'li'].includes(card.tagName)) {
        const parent = card.parentNode
        if (['body', 'main', 'html'].includes(parent.tagName) || walk(parent).filter(isHeading).length > 1)
          break
        card = parent
      }
      if (!card) continue
      // An offering name used as a plain section heading is not a card.
      const parts = walk(card)
      if (!parts.some((n) => n.tagName === 'a') && !['article', 'li'].includes(card.tagName)) continue
      const marked = parts.filter(
        (n) =>
          (/(?:^|[\s_-])(?:summary|description|excerpt|introtext|intro)(?:$|[\s_-])/i.test(
            attr(n, 'class') ?? ''
          ) &&
            !/(?:^|[\s_-])image(?:$|[\s_-])/i.test(attr(n, 'class') ?? '')) ||
          attr(n, 'itemprop') === 'description'
      )
      const summaries = marked.length ? marked : parts.filter((n) => n.tagName === 'p' && !inFacts(n, card))
      const nonempty = summaries.some((n) => {
        // A button placed inside a paragraph is still only a button, never a summary.
        const words = walk(n)
          .filter(
            (p) =>
              p.nodeName === '#text' &&
              !inside(p, new Set(['a', 'button', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']), n)
          )
          .map((p) => p.value)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        return /[\p{L}\p{N}]/u.test(words)
      })
      if (!nonempty)
        out.push({
          page: page.path,
          offering: offering.label,
          place: `offering-summary:${offering.id}`,
          found: `Missing summary for ${offering.label}`
        })
    }
  }
  return out
}

function inside(node, tags, stop) {
  for (let parent = node.parentNode; parent && parent !== stop; parent = parent.parentNode)
    if (tags.has(parent.tagName)) return true
  return false
}

function inFacts(node, card) {
  for (let at = node; at && at !== card; at = at.parentNode)
    if (
      ['dl', 'table', 'aside'].includes(at.tagName) ||
      /(?:^|[\s_-])(?:facts?|meta|price|pricing|schedule)(?:$|[\s_-])/i.test(attr(at, 'class') ?? '')
    )
      return true
  return false
}
