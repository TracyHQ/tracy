// Inspect each served guest quote after every writer and cleanup step. Attribution must be inside its own card;
// another card's reviewer cannot make an anonymous quote pass. Shared by Joomla T3/T4, WordPress and EmDash pages.
import { parse } from 'parse5'
import { endsSentence, sourcedReviewsOf } from 'website-opportunities/domain/review-quotes.mjs'

const attr = (node, name) => node.attrs?.find((a) => a.name === name)?.value
const hidden = (node) =>
  ['script', 'style', 'template', 'noscript'].includes(node.tagName) ||
  attr(node, 'hidden') !== undefined ||
  attr(node, 'aria-hidden') === 'true' ||
  /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr(node, 'style') ?? '')
const children = (node) => (node.childNodes ?? []).filter((n) => !hidden(n))
const walk = (node) => [node, ...children(node).flatMap(walk)]
const text = (node) => (node.nodeName === '#text' ? node.value : children(node).map(text).join(' '))
const folded = (value) =>
  String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["\u201c\u201d]+|["\u201c\u201d]+$/g, '')
    .toLowerCase()
const attribution = (node) =>
  ['cite', 'footer'].includes(node.tagName) ||
  attr(node, 'itemprop') === 'author' ||
  /(?:^|[\s_-])(?:author|reviewer)(?:$|[\s_-])/i.test(attr(node, 'class') ?? '')
const bodyText = (node) =>
  attribution(node) ? '' : node.nodeName === '#text' ? node.value : children(node).map(bodyText).join(' ')
const semantic = (node) =>
  ['blockquote', 'q'].includes(node.tagName) ||
  attr(node, 'itemprop') === 'reviewBody' ||
  /(?:^|\s)(?:quote|testimonial|review)[-_](?:text|content|body)(?:$|\s)/i.test(attr(node, 'class') ?? '')
const contains = (node, value) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${folded(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
    'u'
  ).test(folded(text(node)))

/** @param {{pages: any[], brief: any}} input */
export function checkReviewQuotes({ pages, brief }) {
  const reviews = sourcedReviewsOf(brief)
  if (!reviews.length) return []
  const out = []
  for (const page of pages) {
    if (page.status >= 400) continue
    const nodes = walk(parse(String(page.html ?? '')))
    const possible = nodes.filter((node) => {
      if (semantic(node)) return true
      if (!['p', 'div'].includes(node.tagName) || attribution(node)) return false
      const words = folded(bodyText(node)).replace(/\.{3}$|\u2026$/u, '')
      return words.length >= 15 && reviews.some((r) => folded(r.text).startsWith(words))
    })
    // A blockquote wrapping a marked review body is one quote, read at the body.
    const quotes = possible.filter(
      (node) =>
        !walk(node)
          .slice(1)
          .some((n) => possible.includes(n))
    )
    for (const [index, quote] of quotes.entries()) {
      const words = folded(bodyText(quote))
      if (!words) continue
      let card = quote
      while (card.parentNode && !['article', 'li'].includes(card.tagName)) {
        const parent = card.parentNode
        if (
          ['body', 'main', 'html'].includes(parent.tagName) ||
          walk(parent).filter((n) => quotes.includes(n)).length > 1
        )
          break
        card = parent
      }
      // A whole review, or its own leading sentences ending where one of its sentences ends (never mid-sentence).
      const whole = reviews.find(
        (r) =>
          folded(r.text) === words ||
          (endsSentence(words) && folded(r.text).startsWith(words) && folded(r.text)[words.length] === ' ')
      )
      const source =
        whole ?? reviews.find((r) => folded(r.text).startsWith(words.replace(/\.{3}$|\u2026$/u, '')))
      const reasons = []
      if (!whole) reasons.push('not-whole-sourced-review')
      if (source && !contains(card, source.author)) reasons.push('missing-review-author')
      if (source && !new RegExp(`\\b${source.platform}\\b`, 'i').test(text(card)))
        reasons.push('missing-review-platform')
      for (const reason of reasons)
        out.push({
          kind: 'review-integrity',
          severity: 'major',
          page: page.path,
          place: `quote:${index}`,
          reason,
          found: words,
          why: `Guest quote ${reason}`
        })
    }
  }
  return out
}
