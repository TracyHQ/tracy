/**
 * A WordPress body without the links into the pages the customer unticked.
 *
 * 🔒 A LINK INTO AN UNTICKED PAGE IS TAKEN OFF, NOT SENT ELSEWHERE (product owner, 08/10/2026, TCH #1013). Until then the
 * sweep pointed such a link at the contact page (`linksMoved`), so a button still read "Explore sample plans" and opened the
 * contact form. Now:
 * - a button (`core/button`), or any block whose own `url` attribute leads there (a menu item of a theme's own), goes on its
 *   own; a `core/buttons` group or a list left with nothing in it goes with it. The section around it stays;
 * - a paragraph or a list item whose whole text is that one link goes the same way: it is a link, not a sentence;
 * - a link inside running text loses its anchor and keeps its words, so the sentence keeps every word; an anchor that is
 *   styled as a button (`btn`, `button` in its class, in raw HTML) goes whole, with its words.
 *
 * A block a contract slot writes into (`keep`, the first block of each name) is never taken out of the body: the plugin refuses every
 * guided text edit of a site whose slot block is gone. It is hidden instead (`metadata.blockVisibility: false`, which
 * WordPress 6.9+ renders as nothing, whatever the block), and so is a group whose every block went or was hidden this way.
 * The customer can show it again from the editor.
 *
 * A menu's own link (`core/navigation-link`, `-submenu`) is not this module's: a menu loses that link (`navWithout`).
 * Nothing is re-serialised (`wp-blocks.js`): every edit is a range of the string as it was read, and a body that does not
 * parse back is left as it was.
 */
import { parseBlocks, plain } from './wp-blocks.js'
import { hideEdit as hiddenEdit } from './wp-hide.js'

/** @typedef {import('./wp-blocks.js').Block} Block */
/** @typedef {{ start: number, end: number, text: string }} Edit */

/** A menu's own link: `navWithout` takes it off. */
const MENU_LINK = /^core\/navigation-(?:link|submenu)$/
/** An anchor of raw HTML that is drawn as a button: it goes whole, its words with it. */
const BUTTON_CLASS = /(?:^|[\s_-])(?:btn|button)(?:$|[\s_-])/i
/** Every anchor of a run of HTML, with its attributes and its inside. Anchors do not nest. */
const ANCHOR = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi

const hrefOf = (/** @type {string} */ attrs) => /(?:^|\s)href="([^"]*)"/.exec(attrs)?.[1]
const textOf = (/** @type {string} */ raw) => plain(raw.replace(/<[^>]*>/g, ' '))

/**
 * The body with every link into a page that goes (`away`) taken off, as the rule above says.
 * @param {string} markup
 * @param {(url: string) => boolean} away - whether a link's address is a page that goes
 * @param {Set<string>} [keep] - the names of the blocks the contract's slots write into: hidden, never cut
 * @returns {{ markup: string, removed: string[], unwrapped: number, hidden: number }}
 */
export function linksOff(markup, away, keep = new Set()) {
  const none = { markup, removed: [], unwrapped: 0, hidden: 0 }
  const root = parseBlocks(markup)
  if (!root) return none
  const leads = (/** @type {string | undefined} */ href) =>
    href !== undefined && away(href.replace(/&amp;/g, '&'))
  /** @type {Edit[]} */
  const edits = []
  /** @type {string[]} */
  const removed = []
  let unwrapped = 0
  let hidden = 0

  /** The label of a block that is nothing but a way into a page that goes, else null. */
  const wayIn = (/** @type {Block} */ node) => {
    if (MENU_LINK.test(node.name)) return null
    const inner = markup.slice(node.innerStart, node.innerEnd)
    const url = node.attrs?.url
    if (typeof url === 'string' && away(url)) return textOf(inner) || String(node.attrs?.label ?? url)
    if (node.children.length > 0) return null
    const links = [...inner.matchAll(ANCHOR)]
    if (node.name === 'core/button') {
      const into = links.find((m) => leads(hrefOf(m[1])))
      return into ? textOf(into[2]) : null
    }
    if (node.name !== 'core/paragraph' && node.name !== 'core/list-item') return null
    if (links.length !== 1 || !leads(hrefOf(links[0][1]))) return null
    return textOf(inner.replace(links[0][0], '')) === '' ? textOf(links[0][2]) : null
  }

  const hideEdit = (/** @type {Block} */ node) => hiddenEdit(markup, node)

  // A slot is found by the FIRST block of its name (`slotBlocksLost`): a later block of the same name is no slot's own.
  /** @type {Set<Block>} */
  const slots = new Set()
  /** @type {Set<string>} */
  const named = new Set()
  const firsts = (/** @type {Block} */ node) => {
    const name = node.attrs?.metadata?.name
    if (typeof name === 'string' && keep.has(name) && !named.has(name)) {
      named.add(name)
      slots.add(node)
    }
    for (const child of node.children) firsts(child)
  }
  firsts(root)
  /** Whether a block is a slot's own and must stay in the body. */
  const slotted = (/** @type {Block} */ node) => slots.has(node)

  /** The anchors of a run of a block's own HTML (`from`–`to`) that lead to a page that goes. */
  const anchorsIn = (/** @type {number} */ from, /** @type {number} */ to) => {
    for (const m of markup.slice(from, to).matchAll(ANCHOR)) {
      if (!leads(hrefOf(m[1]))) continue
      const start = from + (m.index ?? 0)
      const end = start + m[0].length
      if (BUTTON_CLASS.test(/(?:^|\s)class="([^"]*)"/.exec(m[1])?.[1] ?? '')) {
        edits.push({ start, end, text: '' })
        removed.push(textOf(m[2]))
        continue
      }
      // The words stay where they were: the opening tag and the closing one go, nothing between them.
      const open = m[0].indexOf('>') + 1
      const close = m[0].length - /<\/a\s*>$/i.exec(m[0])[0].length
      edits.push({ start, end: start + open, text: '' }, { start: start + close, end, text: '' })
      unwrapped += 1
    }
  }

  /**
   * Take off what leads away in one block and under it.
   * @param {Block} node
   * @returns {'gone' | 'hidden' | 'stays'}
   */
  const visit = (node) => {
    if (MENU_LINK.test(node.name)) return 'stays'
    const label = wayIn(node)
    if (label !== null) {
      if (slotted(node)) {
        const edit = hideEdit(node)
        if (!edit) return 'stays'
        edits.push(edit)
        hidden += 1
        removed.push(label)
        return 'hidden'
      }
      edits.push({ start: node.start, end: node.end, text: '' })
      removed.push(label)
      return 'gone'
    }
    const mark = edits.length
    const fates = node.children.map(visit)
    // The block's own HTML, between its inner blocks.
    let from = node.innerStart
    for (const child of node.children) {
      anchorsIn(from, child.start)
      from = child.end
    }
    anchorsIn(from, node.innerEnd)
    const group = node.name === 'core/buttons' || node.name === 'core/list'
    if (!group || fates.length === 0 || fates.some((f) => f === 'stays')) return 'stays'
    if (fates.every((f) => f === 'gone') && !slotted(node)) {
      edits.splice(mark)
      edits.push({ start: node.start, end: node.end, text: '' })
      return 'gone'
    }
    const edit = hideEdit(node)
    if (!edit) return 'stays'
    edits.push(edit)
    return 'hidden'
  }

  for (const top of root.children) visit(top)
  if (edits.length === 0) return none
  const next = applied(markup, edits)
  return parseBlocks(next) ? { markup: next, removed, unwrapped, hidden } : none
}

/**
 * `markup` with non-overlapping edits made, last first. A block cut whole takes the blank line it leaves behind, as `cut`
 * does, so the body does not collect empty lines.
 * @param {string} markup
 * @param {Edit[]} edits
 */
function applied(markup, edits) {
  let out = markup
  for (const { start, end, text } of [...edits].sort((a, b) => b.start - a.start || b.end - a.end)) {
    let to = end
    if (text === '' && end > start && out.startsWith('<!--', start))
      while (
        to < out.length &&
        (out[to] === '\n' || out[to] === '\r') &&
        (start === 0 || out[start - 1] === '\n')
      )
        to += 1
    out = out.slice(0, start) + text + out.slice(to)
  }
  return out
}
