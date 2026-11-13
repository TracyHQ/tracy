// The library HTML the draft write sends (ticket #597): a Tracy library block is written as one rendered HTML module
// (`library-reviews-render.mjs`), so the order fields of that block reach the site only through that HTML. The plan
// keeps, for every shown field of the block and of its items, the text the HTML must show (`libraryExpectsOf`), and the
// guard holds the HTML to it (`libraryHtmlProblems`): a field the HTML does not show means the HTML was rendered from
// other values than the order (`library_html_stale`), and markup that runs code never reaches the site
// (`library_html_unsafe`). Pure.
import { reviewerName } from './library-reviews-names.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
/** The renderer's own escaping (`library-reviews-render.mjs`). */
const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
const UNSAFE = [/<script\b/i, /<iframe\b/i, /\son[a-z]+\s*=/i, /javascript\s*:/i, /<style\b/i]

/** The text the HTML shows for one order entry, escaped as the renderer writes it; null when it shows none. */
function shownOf(entry) {
  const value = typeof entry.value === 'string' ? entry.value.trim() : entry.value
  if (value === null || value === undefined || value === '') return null
  if (entry.field === 'author') {
    const name = reviewerName(value)
    return name ? escapeHtml(name) : null
  }
  if (entry.field === 'rating') return `${Number(value)} out of 5`
  return escapeHtml(value)
}

/** Every text the library HTML must show for one place (the block or one of its items). */
export function libraryExpectsOf(place) {
  return list(place.fields)
    .map((e) => ({ entry: e.place, shown: shownOf(e) }))
    .filter((x) => x.shown !== null)
}

/** The problems of one `library.create` operation's HTML. */
export function libraryHtmlProblems(op, report) {
  const html = String(op.html ?? '')
  if (html.trim() === '') report('library_html_stale', { op: op.key, entry: null, via: 'empty' })
  for (const x of list(op.expects))
    if (!html.includes(x.shown)) report('library_html_stale', { op: op.key, entry: x.entry })
  for (const rule of UNSAFE)
    if (rule.test(html)) report('library_html_unsafe', { op: op.key, rule: rule.source })
}
