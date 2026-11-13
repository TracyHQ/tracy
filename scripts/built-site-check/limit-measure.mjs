// Where a written text field shows on the rendered pages, and how long it shows (ticket #601). The field's element is
// the innermost one whose visible words hold the start of the written words, even across inline tags. What is
// measured is the field's own run there, never the whole element: the words from where the field starts, for as long
// as they are the written words. Other words of the element (a label before it, a tail the template adds after it)
// are the template's, not the field's. A run is counted as every limit of the domain is counted (`charCount`, one
// per code point). An SEO title is read in the page's `title`, an SEO description in its description meta.
import { charCount } from '../../packages/wo/website-opportunities/domain/page-copy-check.mjs'
import { innermostHolding, squash, textOf } from './html-read.mjs'

export const NEEDLE = 24

/** How many characters of `words` the text shows from `at` on, in code points. */
function runLength(text, at, words) {
  const shown = Array.from(text.slice(at))
  const want = [...words]
  let n = 0
  while (n < shown.length && n < want.length && shown[n] === want[n]) n++
  return n
}

/** The longest run of `words` in a text, or -1 when the text does not hold their start. */
function bestRun(text, words) {
  const needle = [...words].slice(0, NEEDLE).join('')
  let best = -1
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1))
    best = Math.max(best, runLength(text, at, words))
  return best
}

/**
 * The rendered run of a written value on the pages, the groups tried in turn (its own page, then every page); of
 * several places, the longest run. Null when no element shows it.
 */
export function renderedRunOf(words, groups) {
  const needle = [...words].slice(0, NEEDLE).join('')
  for (const group of groups) {
    let best = null
    for (const page of group)
      for (const el of innermostHolding(page.tree, needle)) {
        const length = bestRun(textOf(el), words)
        if (length >= 0 && (!best || length > best.length))
          best = { page: page.path, element: el.name, length }
      }
    if (best) return best
  }
  return null
}

/** Every element of a tree, the head included. */
function* allOf(node) {
  for (const c of node.children ?? [])
    if (typeof c !== 'string') {
      yield c
      yield* allOf(c)
    }
}

/** The SEO text of a page: its `title`, or its description meta. */
function seoTextOf(tree, field) {
  for (const el of allOf(tree)) {
    if (field === 'title' && el.name === 'title') return squash(textOf(el))
    if (field === 'description' && el.name === 'meta' && el.attrs.name?.toLowerCase() === 'description')
      return squash(el.attrs.content ?? '')
  }
  return null
}

/** The rendered run of an SEO value on its own page only (another page's title is not this page's), or null. */
export function seoRunOf(words, field, own) {
  for (const page of own) {
    const text = seoTextOf(page.tree, field)
    const length = text === null ? -1 : bestRun(text, words)
    if (length >= 0) return { page: page.path, element: field === 'title' ? 'title' : 'meta', length }
  }
  return null
}

export { charCount }
