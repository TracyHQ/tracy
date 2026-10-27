/**
 * Blocks of a WordPress body hidden from visitors and kept in the body (`metadata.blockVisibility: false`, which WordPress
 * 6.9+ renders as nothing, whatever the block). The customer can show one again from the editor.
 *
 * 🔒 A BLOCK A CONTRACT SLOT WRITES INTO IS HIDDEN, NEVER CUT: the plugin refuses every guided text edit of a site whose slot
 * block is gone (`slotBlocksLost`). A Website Opportunities build hides what it has no source for this way — a dish of the
 * template's menu with no dish of the restaurant to put there, a price nobody collected — instead of leaving the demo's.
 * Nothing is re-serialised (`wp-blocks.js`): every edit is an insertion into a block's own comment.
 */
import { namedBlocks, parseBlocks } from './wp-blocks.js'

/** @typedef {import('./wp-blocks.js').Block} Block */

/**
 * The edit that hides a block from visitors and keeps it in the body, or null when its comment cannot take one.
 * @param {string} markup
 * @param {Block} node
 * @returns {{ start: number, end: number, text: string } | null}
 */
export function hideEdit(markup, node) {
  const comment = markup.slice(node.start, node.selfClosing ? node.end : node.innerStart)
  const at = comment.indexOf('"metadata":{')
  if (at >= 0 && node.attrs?.metadata && typeof node.attrs.metadata === 'object') {
    const after = node.start + at + '"metadata":{'.length
    const empty = markup[after] === '}'
    return { start: after, end: after, text: `"blockVisibility":false${empty ? '' : ','}` }
  }
  if (node.attrs && !('metadata' in node.attrs)) {
    const open = node.start + comment.indexOf('{') + 1
    return { start: open, end: open, text: '"metadata":{"blockVisibility":false},' }
  }
  if (node.attrs === null) {
    const name = /^<!--\s+wp:\S+/.exec(comment)
    if (!name) return null
    const end = node.start + name[0].length
    return { start: end, end, text: ' {"metadata":{"blockVisibility":false}}' }
  }
  return null
}

/**
 * The blocks the targets name: the nth block of a name, or the block `up` levels above it (the unnamed group that holds a
 * named heading and its list). A target the body does not have names nothing.
 * @param {Block} root
 * @param {Array<{ block: string, nth: number, up?: number }>} targets
 * @returns {Set<Block>}
 */
function targetsIn(root, targets) {
  /** @type {Map<Block, Block>} */
  const parents = new Map()
  const walk = (/** @type {Block} */ node) => {
    for (const child of node.children) {
      parents.set(child, node)
      walk(child)
    }
  }
  walk(root)
  /** @type {Set<Block>} */
  const out = new Set()
  for (const { block, nth, up = 0 } of targets) {
    let node = namedBlocks(root, block)[nth - 1]
    for (let i = 0; i < up && node; i += 1) node = parents.get(node)
    if (node && node !== root) out.add(node)
  }
  return out
}

/** Whether a block is hidden from visitors already. */
export const isHidden = (/** @type {Block} */ node) => node.attrs?.metadata?.blockVisibility === false

/**
 * The body with the nth block of each name hidden. A block that is not there, or is hidden already, is left; a body that
 * does not parse back is left as it was.
 * @param {string} markup
 * @param {Array<{ block: string, nth: number, up?: number }>} targets
 * @returns {{ markup: string, hidden: number }}
 */
export function hideBlocks(markup, targets) {
  const root = parseBlocks(markup)
  if (!root || targets.length === 0) return { markup, hidden: 0 }
  /** @type {Array<{ start: number, end: number, text: string }>} */
  const edits = []
  for (const node of targetsIn(root, targets)) {
    if (isHidden(node)) continue
    const edit = hideEdit(markup, node)
    if (edit) edits.push(edit)
  }
  let out = markup
  for (const edit of edits.sort((a, b) => b.start - a.start))
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  return parseBlocks(out) ? { markup: out, hidden: edits.length } : { markup, hidden: 0 }
}

/**
 * The body as a visitor reads it, for the planners: without the blocks hidden already, nor the ones about to be (`targets`).
 * Never written back: a hidden block stays in the site's body.
 * @param {string} markup
 * @param {Array<{ block: string, nth: number, up?: number }>} [targets]
 * @returns {string}
 */
export function shownOnly(markup, targets = []) {
  const root = parseBlocks(markup)
  if (!root) return markup
  /** @type {Array<[number, number]>} */
  const ranges = []
  const going = targetsIn(root, targets)
  const walk = (/** @type {Block} */ node) => {
    if (node !== root && (isHidden(node) || going.has(node))) {
      ranges.push([node.start, node.end])
      return
    }
    for (const child of node.children) walk(child)
  }
  walk(root)
  let out = markup
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + out.slice(end)
  return out
}
