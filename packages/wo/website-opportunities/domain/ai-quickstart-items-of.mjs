// Blocks that list the same records (ticket #584): `itemsOf` and `itemsOrder` on a block store block. Pure.
//
//   "itemsOrder": {"by": "title", "direction": "asc", "from": "<the block's own ordering setting>"}
//   "itemsOf": {"block": "class-list", "select": "all", "fields": {"heading-2": "heading", ...}, "why": "..."}
//
// The build creates a record once, as an item of the block that owns it. A block whose items are records another
// block owns declares the owner (`itemsOf.block`), which of the owner's records it shows (`select`: `all`, or a
// sentence), and the owner item field each of its own item fields draws (`fields`). It declares only its own data:
// its count (`items`), its order (`itemsOrder`, read from its ordering setting) and its limits (a place it shares with
// the owner is written within the smallest limit, `sharedPlacesOf`).
//   - two blocks whose item fields store places on the same records are linked: one names the other, or both name the
//     same owner; an owner names none;
//   - every block of such a group declares its order; two of them listing their common records in a different order
//     declare different orders.
import { recordOf } from './ai-quickstart-field-keys.mjs'

export const ITEMS_ORDER_BY = Object.freeze([
  'title',
  'published',
  'created',
  'ordering',
  'hits',
  'menu',
  'path'
])
export const ITEMS_DIRECTIONS = Object.freeze(['asc', 'desc'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const list = (value) => (Array.isArray(value) ? value : [])

/** The records a block's items are, in item order: those its item fields store places on. */
export function itemRecordsOf(block) {
  const first = list(block?.itemFields).find((f) => Array.isArray(f?.slots))
  return list(first?.slots)
    .map((p) => (Array.isArray(p) ? p.flat(2)[0] : p))
    .filter(isName)
    .map(recordOf)
}

function orderProblem(order) {
  if (!isObject(order) || !ITEMS_ORDER_BY.includes(order.by) || !ITEMS_DIRECTIONS.includes(order.direction))
    return `itemsOrder is {by: ${ITEMS_ORDER_BY.join(' | ')}, direction: asc | desc, from}`
  if (!isName(order.from)) return 'itemsOrder.from names the ordering setting the order is read from'
  return null
}

function itemsOfProblems(block, at, byId, report) {
  const link = block.itemsOf
  if (!isObject(link) || !isName(link.select) || !isName(link.why) || !isObject(link.fields))
    return report(`${at}.itemsOf`, 'itemsOf is {block, select, fields, why}')
  const owner = byId.get(link.block)
  if (!owner || owner === block || !list(owner.itemFields).length)
    return report(
      `${at}.itemsOf.block`,
      `${JSON.stringify(link.block)} is no other block of the store with items`
    )
  if (owner.itemsOf !== undefined)
    report(`${at}.itemsOf.block`, `${owner.id} lists the records of ${owner.itemsOf?.block}: name the owner`)
  const ownerFields = new Map(list(owner.itemFields).map((f) => [f?.name, f]))
  for (const f of list(block.itemFields)) {
    if (!isName(f?.name) || f.type === 'design') continue
    const drawn = ownerFields.get(link.fields[f.name])
    if (!drawn || drawn.type !== f.type)
      report(
        `${at}.itemsOf.fields[${f.name}]`,
        `name the ${f.type} item field of ${owner.id} this field draws`
      )
  }
  if (block.itemsOrder === undefined)
    report(`${at}.itemsOrder`, 'a block that lists the records of another declares its order')
}

/** The owner a block's items belong to: the block it names, else itself. */
const ownerOf = (block) => (isName(block.itemsOf?.block) ? block.itemsOf.block : block.id)

/** Every itemsOf and itemsOrder problem of a block store. */
export function itemsOfStoreProblems(store, report) {
  const blocks = list(store?.blocks).filter((b) => isObject(b) && isName(b.id))
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const atOf = (b) => `blocks[${b.id}]`
  for (const b of blocks) {
    if (b.itemsOrder !== undefined) {
      const problem = orderProblem(b.itemsOrder)
      if (problem) report(`${atOf(b)}.itemsOrder`, problem)
    }
    if (b.itemsOf !== undefined) itemsOfProblems(b, atOf(b), byId, report)
  }
  const unordered = new Set()
  const listed = blocks.map((b) => ({ b, records: itemRecordsOf(b) })).filter((x) => x.records.length)
  for (let i = 0; i < listed.length; i++)
    for (let j = i + 1; j < listed.length; j++) {
      const [x, y] = [listed[i], listed[j]]
      const common = x.records.filter((r) => y.records.includes(r))
      if (!common.length) continue
      const linked = ownerOf(x.b) === ownerOf(y.b) || ownerOf(x.b) === y.b.id || ownerOf(y.b) === x.b.id
      if (!linked) {
        report(
          `${atOf(y.b)}.itemsOf`,
          `its items are records ${x.b.id} also lists (${common.join(', ')}): name the block that owns them`
        )
        continue
      }
      for (const b of [x.b, y.b])
        if (b.itemsOrder === undefined && b.itemsOf === undefined && !unordered.has(b.id)) {
          unordered.add(b.id)
          report(`${atOf(b)}.itemsOrder`, 'a block whose records another block lists declares its order')
        }
      const inOrder = (r) => r.filter((rec) => common.includes(rec)).join()
      const same = (a, b) => a?.by === b?.by && a?.direction === b?.direction
      if (inOrder(x.records) !== inOrder(y.records) && same(x.b.itemsOrder, y.b.itemsOrder))
        report(
          `${atOf(y.b)}.itemsOrder`,
          `it lists the records it shares with ${x.b.id} in another order, yet declares the same order`
        )
    }
}
