/**
 * Sibling contact lines in a module's own markup, placed so no node a contract slot binds to moves (spec TracyHQ/tracy#189,
 * COO rule 29/10/2026: every real contact channel the brief holds is shown and clickable).
 *
 * 🔒 A NEW LINE NEVER MOVES A BOUND NODE. The Joomla plugin resolves a slot's path (`/html/body/div/a[2]/text()`) under a
 * synthetic `<div>` root it wraps the HTML in, and refuses the whole site's contract when a path finds no node or two. A
 * sibling `<a>` put after the first one makes `a[2]` another link, and a second `<p>` beside the address makes `/div/p`
 * ambiguous. So each placement is tried in order, and the first one that leaves every bound path on the same node with the
 * same words wins:
 *   1. the new lines as clones of the line they follow (an `<li>`, a `<p>`, or the link itself), right after it
 *   2. the same lines in one plain `<div>` right after it (a nested node is on no bound path of the block)
 *   3. the lines at the end of the block
 * With none, nothing is added. Framework-wide (Joomla custom module HTML), never per template. Pure.
 */
import { boundNodes, sameBoundNode } from './joomla-bound-nodes.js'

export { boundNodes }

/** The words of a node (an attribute's value, a text, an element's text). */
function wordsOf(/** @type {any} */ node) {
  if ('value' in node && typeof node.value === 'string') return node.value
  return (node.childNodes ?? []).map(wordsOf).join('')
}

/** Whether every bound path that found one node before finds the same node (`sameBoundNode`), with the same words, after. */
export function keepsBound(
  /** @type {string} */ before,
  /** @type {string} */ after,
  /** @type {string[]} */ xpaths
) {
  for (const xpath of xpaths) {
    const was = boundNodes(before, xpath)
    if (!was || was.length !== 1) continue
    const now = boundNodes(after, xpath)
    if (!now || now.length !== 1 || !sameBoundNode(was[0], now[0]) || wordsOf(now[0]) !== wordsOf(was[0]))
      return false
  }
  return true
}

/**
 * The HTML with new lines after a line of a block, in the first placement that keeps every bound node.
 * @param {object} input
 * @param {string} input.html - the block's HTML
 * @param {{ start: number, end: number, tag: string | null, open: string }} input.line - the line the new ones follow: its
 *   span in `html`, and the element that is the whole line (`li`, `p`, `div`) with its opening tag, or null for a bare link
 * @param {string[]} input.links - each new line's link (`<a ...>...</a>`)
 * @param {string[]} [input.bound] - the content map's paths into this HTML
 * @returns {string | null} null when no placement keeps the bound nodes
 */
export function placeLines({ html, line, links, bound = [] }) {
  if (links.length === 0) return html
  const close = line.tag ? `</${line.tag}>` : ''
  // A clone never repeats the line's id.
  const open = line.open.replace(/\sid\s*=\s*(["'])[^"']*\1/i, '')
  const lines = links.map((link) => (line.tag ? `${open}${link}${close}` : link))
  const sep = line.tag ? '' : ' '
  const after = (/** @type {string} */ extra) => `${html.slice(0, line.end)}${extra}${html.slice(line.end)}`
  const tries = [after(`${sep}${lines.join(sep)}`)]
  // A plain `<div>` cannot sit in a list: a list line is only cloned, never wrapped.
  if (line.tag !== 'li') tries.push(after(`<div>${lines.join(sep)}</div>`))
  if (line.tag !== 'li') tries.push(`${html}<div>${lines.join(sep)}</div>`)
  return tries.find((next) => keepsBound(html, next, bound)) ?? null
}

/** The line a link sits on: the element whose only content is that link (`<li><a/></li>`), else the link itself. */
export function lineOf(/** @type {string} */ html, /** @type {number} */ start, /** @type {number} */ end) {
  const before = html.slice(0, start)
  const open = /<(li|p|div)\b[^>]*>\s*$/i.exec(before)
  if (open) {
    const tag = open[1].toLowerCase()
    const close = new RegExp(`^\\s*</${tag}\\s*>`, 'i').exec(html.slice(end))
    if (close) return { start: open.index, end: end + close[0].length, tag, open: open[0].trim() }
  }
  return { start, end, tag: null, open: '' }
}
