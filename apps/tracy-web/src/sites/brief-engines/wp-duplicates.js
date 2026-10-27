/**
 * A slot key the contract gives to more than one block.
 *
 * 🔒 THE PLUGIN WRITES THE FIRST BLOCK OF A NAME AND NEVER THE REST. `tracy-business/wp7` names 15 slots twice or
 * three times on one page — `about.text.heading` is the page's own heading, its "Where we work" heading and its
 * "Safety" heading — because three sections of one page share the block name `text.heading`. A planner that
 * keys its answers by slot key gets ONE value for the three, the contract door writes it into the first block,
 * and the other two keep the template's words (measured 03/10/2026: a bakery's About page still told where "head
 * office and plant" are, in the Vorsino industrial park). Worse, which of the three the one value was written for is
 * whichever batch answered last.
 *
 * So the planner is shown every block under a key of its own — the second occurrence of `about.text.heading` is
 * `about.text2.heading` — and the answer for each is written where it belongs: the first occurrences through the
 * contract, as always, the others by block, through the open surface (`wp-residue.js` `sweepWordPress`), which
 * can name "the second block called `text.heading` on the about page".
 *
 * Every language the customer asked for is planned the same way (`wordpress.js` `planExtra`): its copy of the page has the
 * same three blocks, and the contract door writes only the first of them there too (measured 05/10/2026, ledger L15).
 */

import { leavesOf, namedBlocks, parseBlocks } from './wp-blocks.js'

/**
 * @typedef {object} Repeat
 * @property {string} key - the key the contract gives the block
 * @property {string} entity - `page-about`
 * @property {string} block - the block's `metadata.name`
 * @property {string} attr - what of the block the slot is (`content`)
 * @property {number} nth - which of the blocks of that name on the page, counting from 1
 */

/**
 * The contract map with every repeated key made unique, and where each new key goes.
 * @param {{ entities: any[], slots: any[] }} contentMap
 * @returns {{ map: { entities: any[], slots: any[] }, repeats: Map<string, Repeat> }}
 */
export function uniqueSlots(contentMap) {
  const taken = new Set(contentMap.slots.map((s) => String(s.key)))
  /** @type {Map<string, number>} */
  const seen = new Map()
  /** @type {Map<string, Repeat>} */
  const repeats = new Map()
  const slots = contentMap.slots.map((slot) => {
    const id = `${slot.entity}\u0000${slot.key}`
    const nth = (seen.get(id) ?? 0) + 1
    seen.set(id, nth)
    if (nth === 1 || !slot.target?.block) return slot
    // The second `text.heading` of a page is `text2.heading`: the same shape of key, so a planner that reads a
    // key for its role (heading, intro, an item's meta) reads it right.
    const parts = String(slot.key).split('.')
    let key = ''
    for (let n = nth; ; n += 1) {
      const next =
        parts.length >= 3
          ? [parts[0], `${parts[1]}${n}`, ...parts.slice(2)]
          : [`${parts[0]}${n}`, ...parts.slice(1)]
      key = next.join('.')
      if (!taken.has(key)) break
    }
    taken.add(key)
    repeats.set(key, {
      key: String(slot.key),
      entity: String(slot.entity),
      block: String(slot.target.block),
      attr: String(slot.target.attr ?? 'content'),
      nth
    })
    return { ...slot, key }
  })
  return { map: { ...contentMap, slots }, repeats }
}

/**
 * What the nth block of a name says on a page, as a visitor reads it, or null when the page has no such block (or no text in
 * it). The contract door reads the FIRST block of a name only (`editionContentMap`), so the sample of a second or third block
 * of another language's copy — the words its planner must be shown — is read here.
 * @param {string | null | undefined} markup
 * @param {string} block - the block's `metadata.name`
 * @param {number} nth - counting from 1
 * @returns {string | null}
 */
export function blockText(markup, block, nth) {
  const root = typeof markup === 'string' ? parseBlocks(markup) : null
  const node = root ? namedBlocks(root, block)[nth - 1] : undefined
  if (!node || !markup) return null
  const text = leavesOf(markup, node).join(' ')
  return text === '' ? null : text
}
