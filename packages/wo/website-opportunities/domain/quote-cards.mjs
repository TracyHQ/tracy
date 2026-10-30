// The lines of a guest quote card (spec TracyHQ/tracy#189, criterion 2.2): every visible line of a quote card is a part
// of its quote group, so the brief build fills the whole card from one sourced review or empties it whole.
//
// 🔒 A LINE OF A QUOTE CARD THAT STANDS OUTSIDE ITS GROUP IS NEVER WRITTEN AS PAGE COPY. Measured on a pilot build: a
// pull-quote heading (with the quote mark) was declared a paragraph outside the quote group, the copy writer filled it
// with the business's own blurb, and the reviewer's name stood under it, so the blurb read as a customer's words. The
// packing check refuses such a map (`content-map-lint-quotes.js`); the build empties such a line (`planHonesty`).
//
// The card a slot sits in is read from its field path, never a template's name: a JSON field of a block's settings
// (`[block, block[field], n]`) or an item of a repeated field list (`[list, list<N>, field]`). A slot with no field path
// (bound by markup only) is not judged here.

const list = (v) => (Array.isArray(v) ? v : [])

/**
 * The card a slot's field sits in: its entity, column, the top field of its path and the item number, or null when the
 * slot has no field path.
 * @param {any} slot
 * @returns {string | null}
 */
export function quoteCardOf(slot) {
  const path = list(slot?.jsonPath)
  if (!path.length || typeof path[0] !== 'string') return null
  const last = path.at(-1)
  const numbered = typeof path[1] === 'string' ? /^(.+?)(\d+)$/.exec(path[1]) : null
  const item = Number.isInteger(last) ? last : numbered && numbered[1] === path[0] ? Number(numbered[2]) : ''
  return [slot.entity, slot.column ?? '', slot.nestedJson ?? '', path[0], item].join('|')
}

/**
 * The text slots that belong to a guest quote card but stand outside its quote group: a slot with a `quote.*` role and
 * no group, and every ungrouped text slot whose field sits in the same card as a quote group's slots.
 * @param {{slots?: any[]} | null} contentMap
 * @returns {Array<{slot: any, group: string | null}>} each stray slot, with the quote group whose card it sits in
 */
export function strayQuoteLinesOf(contentMap) {
  const slots = list(contentMap?.slots)
  /** @type {Map<string, string>} card → quote group id */
  const cards = new Map()
  for (const s of slots) {
    if (s?.group?.kind !== 'quote' || !s.group.id) continue
    const card = quoteCardOf(s)
    if (card && !cards.has(card)) cards.set(card, s.group.id)
  }
  const out = []
  for (const s of slots) {
    if (s?.type !== 'text' || s.group?.id) continue
    const card = quoteCardOf(s)
    const group = card ? (cards.get(card) ?? null) : null
    if (group || String(s.role ?? '').startsWith('quote.')) out.push({ slot: s, group })
  }
  return out
}
