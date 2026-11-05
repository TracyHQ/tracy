// Row pairs: which text slots of a block print inside the same card as a list row's picture. A list of pictures whose
// rows 1..n each sit in a card beside plain block text slots (a heading and ticked lines per exercise card) only reads
// right when a plan keeps a card's texts and its picture row together; nothing in the content map says so, so the
// frames pass measures it (read-row-cards.js: the smallest repeated card the picture sits in, and the block's text
// slots shown inside it) and this module writes it on every list row:
//   rows[i].printsIn     the card's element signature (`DIV.col-12.col-md-6`), or `block` when the picture has no
//                        repeated card of its own (an intro clip printed alone above the cards)
//   rows[i].pairedSlots  ids of the block's text slots printed inside that card (the row's own slots left out)
//   lists[].rowPairsFrom `measured`, or `declared` when a person wrote the pairs (never measured over)
// Self-check `rowPartsUnpaired`: a list whose rows print in more than one part (a lone row and card rows) while a card
// row pairs no slot, and the pairs are not declared. Count in `kit.checks`, the first lists in `kit.coverage.failures`;
// a list a person explained in `reach-accepts.json` (check-accepts.mjs) is still counted, listed in `kit.checkAccepts`.
import { settleCheckParts } from './check-accepts.mjs'

export const ROW_PAIR_PARTS = ['rowPartsUnpaired']
const NAMED = 20

const each = (value) => (Array.isArray(value) ? value : [])

/**
 * Write `printsIn` and `pairedSlots` on every list row from the frames pass (`frame-evidence.json`, each frame's
 * `rowCard` at the kit's first width). Changes `kit` in place.
 * @param {object} kit
 * @param {Record<string, {widths?: Record<string, {rowCard?: {printsIn: string, texts: string[]}}>}>} evidence
 */
export function pairListRows(kit, evidence) {
  const desk = String(kit?.widths?.[0] ?? '1440')
  for (const b of each(kit?.blocks))
    for (const list of each(b?.lists)) {
      if (list?.rowPairsFrom === 'declared' || list?.rowKind === 'items') continue
      let measured = 0
      for (const row of each(list?.rows)) {
        const own = new Set(each(row?.slots).map((s) => s?.id))
        const card = each(row?.slots)
          .filter((s) => s?.type === 'image')
          .map((s) => evidence?.[s.id]?.widths?.[desk]?.rowCard)
          .find(Boolean)
        if (!card) {
          delete row.printsIn
          delete row.pairedSlots
          continue
        }
        row.printsIn = String(card.printsIn ?? 'block')
        row.pairedSlots = row.printsIn === 'block' ? [] : each(card.texts).filter((id) => !own.has(id))
        measured++
      }
      if (measured) list.rowPairsFrom = 'measured'
      else delete list.rowPairsFrom
    }
}

function unpairedOf(kit) {
  const out = []
  for (const b of each(kit?.blocks))
    for (const list of each(b?.lists)) {
      if (list?.rowPairsFrom === 'declared') continue
      const rows = each(list?.rows).filter((r) => typeof r?.printsIn === 'string')
      const parts = new Set(rows.map((r) => r.printsIn))
      if (parts.size < 2) continue
      const lone = rows.filter((r) => r.printsIn !== 'block' && !each(r.pairedSlots).length)
      if (!lone.length) continue
      out.push({
        where: `lists[${list.id}]`,
        reason: `list ${list.id} of block ${b.id} prints its rows in ${[...parts].join(' and ')}, and row ${lone
          .map((r) => r.index)
          .join(
            ', '
          )} sits in a card with no paired text slot: a plan cannot tell which texts go with which picture (measure again or declare the pairs)`
      })
    }
  return out
}

/**
 * Count `rowPartsUnpaired` on `kit` (changed in place: `checks`, `checkAccepts` and `coverage.failures`) and return it.
 * @param {object} kit
 * @param {{accepts?: object[]}} [o] the entries of reach-accepts.json (readCheckAccepts)
 */
export function rowPairChecks(kit, { accepts = [] } = {}) {
  return settleCheckParts(kit, { rowPartsUnpaired: unpairedOf(kit) }, { accepts, named: NAMED })
}
