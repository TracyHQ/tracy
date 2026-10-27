/**
 * The demo facts a WordPress body shows outside the contract's slots — a footer's phone, mailbox and hours, a hero's address
 * link — said with the restaurant's own (`contract-copy-pins.mjs` `facts`), or hidden when none of them was collected.
 *
 * 🔒 ONLY AN OPPORTUNITY'S BUILD (manager, 22/10/2026): its facts come from Google and the restaurant's profiles, each with its
 * source. A customer's own build keeps the demo's contact lines as placeholders (`wp-contacts.js`, 11/10/2026).
 * A paragraph block takes its lines, joined, as its whole text; a group's paragraphs are replaced by one paragraph per line, in
 * the place of the first of them. Nothing else of the block moves, and a body that does not parse back is left as it was.
 */
import { namedBlocks, parseBlocks } from './wp-blocks.js'
import { hideBlocks } from './wp-hide.js'

/** @typedef {{ label?: string, text: string, href?: string }} FactLine */

const escape = (/** @type {string} */ text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** One line as the template draws it: a highlighted label, then the fact, a link when it has one. */
function lineHtml(/** @type {FactLine} */ line) {
  const label = line.label ? `<span class="highlight">${escape(line.label)}</span> ` : ''
  const away = line.href?.startsWith('https:') ? ' target="_blank" rel="noopener"' : ''
  const text = line.href
    ? `<a href="${escape(line.href)}"${away}>${escape(line.text)}</a>`
    : escape(line.text)
  return `${label}${text}`
}

/**
 * @param {string} markup
 * @param {Array<{ block: string, nth: number, lines: FactLine[] | null }>} facts - of this body
 * @returns {{ markup: string, written: number, hidden: number }}
 */
export function writeFacts(markup, facts) {
  let out = markup
  let written = 0
  for (const fact of facts.filter((f) => f.lines)) {
    const root = parseBlocks(out)
    const node = root ? namedBlocks(root, fact.block)[fact.nth - 1] : undefined
    if (!node) continue
    const lines = /** @type {FactLine[]} */ (fact.lines)
    let next = null
    if (node.name === 'core/paragraph' && node.children.length === 0) {
      const inner = out.slice(node.innerStart, node.innerEnd)
      const open = /<p\b[^>]*>/.exec(inner)
      const close = inner.lastIndexOf('</p>')
      if (open && close > open.index)
        next =
          out.slice(0, node.innerStart + open.index + open[0].length) +
          // A paragraph has room for one line: every line is said in it, so the weekend's hours are not lost.
          lines.map(lineHtml).join(' · ') +
          out.slice(node.innerStart + close)
    } else {
      /** @type {import('./wp-blocks.js').Block[]} */
      const paragraphs = []
      const walk = (/** @type {import('./wp-blocks.js').Block} */ n) => {
        for (const child of n.children) {
          if (child.name === 'core/paragraph') paragraphs.push(child)
          else walk(child)
        }
      }
      walk(node)
      if (paragraphs.length > 0) {
        const fresh = lines
          .map((line) => `<!-- wp:paragraph -->\n<p>${lineHtml(line)}</p>\n<!-- /wp:paragraph -->`)
          .join('\n\n')
        const first = paragraphs[0]
        const last = paragraphs[paragraphs.length - 1]
        next = out.slice(0, first.start) + fresh + out.slice(last.end)
      }
    }
    if (next !== null && next !== out && parseBlocks(next)) {
      out = next
      written += 1
    }
  }
  const hid = hideBlocks(
    out,
    facts.filter((f) => !f.lines)
  )
  return { markup: hid.markup, written, hidden: hid.hidden }
}
