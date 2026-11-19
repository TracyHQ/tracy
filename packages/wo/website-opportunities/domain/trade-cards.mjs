// The cards of a repeating block kept on trade basis (#575, item A of the page writer audit). The step chain's planner
// keeps a block that shows how a session, a visit, an order or a first contact typically runs and describes each
// stage from common practice of the trade ("Trade knowledge", `apps/tracy-web/src/site-planner/planner-prompt.md`);
// its writer writes as many items as the kit shows (`writer-prompt.md` "Fit the slot"). The build chat's plan marks
// the BLOCK `basis: "trade"` (`plan-gate-trade.mjs`); such a block has no item of the business to carry its cards.
//
// So code gives it cards: as many as the block declares it shows at most (`items.max`, the kit's own count), each a
// plan item of kind `trade.card` with no data of the business, keyed `trade-<block id>-<n>`. The writer writes their
// fields from the trade under its no invention rules (`page-writer-prompt.md` rule 8, the copy check's `trade_terms`),
// and the write order shows them like any item. A block that already shows items, or declares no item fields, gets
// none. The ids follow from the approved plan alone, so the writer and the write order give the same cards. Pure: the
// plan and the plan data are copied, never changed.
import { planDataOfPlan } from './plan-data-of-plan.mjs'
import { isTradeBlock } from './plan-gate-trade.mjs'

/** The data kind of a trade card: an item with no value of the business. */
export const TRADE_CARD_KIND = 'trade.card'

const list = (value) => (Array.isArray(value) ? value : [])

/** The id of the n-th card (from 1) of a planned block. */
export const tradeCardId = (blockId, n) => `trade-${blockId}-${n}`

/**
 * The cards of every repeating trade block of a plan, by plan block id.
 * @param {object} plan the approved plan
 * @param {Map<string, object>} blocks the block descriptions by id (block store and library)
 * @param {{byId: Map}} data the plan data (`planDataOf`)
 * @returns {Map<string, string[]>}
 */
export function tradeCardsOf(plan, blocks, data) {
  const out = new Map()
  for (const page of list(plan?.pages))
    for (const block of list(page?.blocks)) {
      if (!isTradeBlock(block)) continue
      const description = blocks.get(block.block)
      if (list(description?.itemFields).length === 0) continue
      if (list(block.data).some((id) => data.byId.get(id)?.what === 'item')) continue
      const max = description.items?.max
      const n = Number.isInteger(max) && max > 0 ? max : 0
      if (n > 0)
        out.set(
          block.id,
          Array.from({ length: n }, (_, k) => tradeCardId(block.id, k + 1))
        )
    }
  return out
}

/**
 * The plan and the plan data with the trade cards in: each card id appended to its block's `data`, and an item entry
 * for it in the data (`what: 'item'`, kind `trade.card`, no field values). Unchanged when the plan has none.
 * @returns {{plan: object, data: object, cards: Map<string, string[]>}}
 */
export function withTradeCards(plan, blocks, data) {
  const cards = tradeCardsOf(plan, blocks, data)
  if (cards.size === 0) return { plan, data, cards }
  const byId = new Map(data.byId)
  const items = [...list(data.items)]
  for (const ids of cards.values())
    ids.forEach((id, k) => {
      const entry = { id, kind: TRADE_CARD_KIND, label: `Card ${k + 1}`, sources: [] }
      byId.set(id, { what: 'item', kind: TRADE_CARD_KIND, entry, source: { fields: {} } })
      items.push(entry)
    })
  const withCards = {
    ...plan,
    pages: list(plan.pages).map((page) => ({
      ...page,
      blocks: list(page.blocks).map((block) =>
        cards.has(block.id) ? { ...block, data: [...list(block.data), ...cards.get(block.id)] } : block
      )
    }))
  }
  return { plan: withCards, data: { ...data, byId, items }, cards }
}

/**
 * The plan as the build shows it, and its plan data: the plan data the plan gate held the plan to (`planDataOfPlan`)
 * with the trade cards in (`withTradeCards`). Every build stage that reads the plan's blocks (the page writer, the
 * pictures, the icons, the write order) reads this one, so a field one stage fills is never one another stage has not
 * heard of (#575: the trade cards' icon fields reached the write order with no icon, `field_unaccounted`).
 * @param {object} profile the approved needs profile
 * @param {object} plan the approved plan
 * @param {Map<string, object>} blocks the block descriptions by id (block store and library)
 * @returns {{plan: object, data: object, cards: Map<string, string[]>}}
 */
export function shownPlanOf(profile, plan, blocks) {
  return withTradeCards(plan, blocks, planDataOfPlan(profile, plan))
}
