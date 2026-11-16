// One order for one list of records (ticket #597, gate run 7): the class cards of the home page and of the class page
// showed the same records in two orders. A created article carried no order of its own, so a list ordered by its
// publish date (the kit's `itemsOrder {by: "published", direction: "desc"}`: com_content's global order) printed the
// records in whatever order a write of a few seconds left. The plan now gives every created article its rank in its
// list (one list per page type, the plan's order: the order the plan first places the records in), and the write step
// writes that rank as the record's order and its publish date (rank 1 newest; `step-chain-draft-item-order.js`).
// A block whose kit declares another order (`itemsOrder.by` title, menu, path: its module's own setting) keeps it:
// `plan.itemOrders` names, for every placed block that lists records, which order it shows. Pure; part of `opsOf`.

const list = (value) => (Array.isArray(value) ? value : [])
/** The record kinds a list block shows in the order the write gives them. */
const LISTED = new Set(['article'])

/**
 * Each created record's place in its list, by record key: `{list, rank, of}`.
 * @returns {Map<string, {list: string, rank: number, of: number}>}
 */
export function listOrdersOf(state) {
  const lists = new Map()
  for (const r of state.sink.records.values()) {
    if (r.kind !== 'created' || !LISTED.has(r.recordKind) || !r.pageType) continue
    lists.set(r.pageType, [...(lists.get(r.pageType) ?? []), r.key])
  }
  const out = new Map()
  for (const [name, keys] of lists)
    keys.forEach((key, i) => out.set(key, { list: name, rank: i + 1, of: keys.length }))
  return out
}

/**
 * The order every placed block that lists records shows: the plan's (`follows: "plan"`, a published order the write
 * sets) or the one its kit declares (`follows: "kit"`, with `by` and `direction`).
 * @returns {Array<{block: string, lists: string, by: string, direction: string, follows: 'plan' | 'kit'}>}
 */
export function itemOrdersOf(state) {
  const out = new Map()
  for (const page of list(state.order.pages))
    for (const block of list(page.blocks)) {
      const store = state.kit.store.get(block.block)
      const order = store?.itemsOrder
      if (!order || out.has(block.block) || block.state === 'hidden') continue
      out.set(block.block, {
        block: block.block,
        lists: store.itemsOf?.block ?? block.block,
        by: order.by,
        direction: order.direction,
        follows: order.by === 'published' ? 'plan' : 'kit'
      })
    }
  return [...out.values()]
}
