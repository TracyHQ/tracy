// A block whose items are the records of another block (ticket #584): `itemsOf` and `itemsOrder`. Pure.
//
// Several blocks of a template list the same records: the home page's class cards and the classes page both list the
// class articles, the phone menu lists the main menu's items. The build creates each record once, through the block
// that owns it; a block that only shows them declares whose records they are (`itemsOf`), which of them it shows
// (`select`), and which of the owner's item fields each of its own item fields draws (`fields`). Every block of such
// a group declares the order it lists them in (`itemsOrder`), read from the block's own ordering setting.
//
// Decision shape (draft-decisions.json, on the block or its group):
//   "itemsOf": {"block": "<owner store block>", "select": "all" | "<which of the owner's records>", "why": "..."}
//   "itemsOrder": {"by": "<field>", "direction": "asc" | "desc", "from": "<the setting it is read from>"}
// The draft adds `fields` to `itemsOf`, matched by stored place: the owner item field that stores the same place on
// a record both blocks list (a derived field matches the owner's field derived the same way).

const list = (value) => (Array.isArray(value) ? value : [])
const recordOf = (place) =>
  String(place)
    .split('@')[0]
    .replace(/\.[^.]*$/, '')
const placesOf = (field) =>
  list(field.slots)
    .flat(3)
    .filter((p) => typeof p === 'string')

/** Copy the decided keys onto a drafted block, in reading order. */
export function applyItemsOf(block, decision) {
  if (decision.itemsOrder) block.itemsOrder = decision.itemsOrder
  if (decision.itemsOf) block.itemsOf = { ...decision.itemsOf }
}

/** The owner item field each of a linked block's item fields draws, or a problem naming the field it cannot match. */
function fieldsOf(block, owner, problem) {
  const ownerFields = list(owner.itemFields)
  const fields = {}
  for (const f of list(block.itemFields)) {
    if (f.type === 'design') continue
    const own = new Set(placesOf(f))
    const match = own.size
      ? ownerFields.find((o) => o.type === f.type && placesOf(o).some((p) => own.has(p)))
      : ownerFields.find((o) => o.type === f.type && o.derived !== undefined && o.derived === f.derived)
    if (match) fields[f.name] = match.name
    else problem(`itemsOf: item field "${f.name}" stores no place an item field of ${owner.id} stores`)
  }
  return fields
}

/** Fill `fields` of every `itemsOf` the decisions set, once every block is drafted. */
export function linkItemsOf(blocks, out) {
  for (const block of blocks) {
    if (!block.itemsOf) continue
    const owner = blocks.find((b) => b.id === block.itemsOf.block)
    if (!owner) {
      out.problems.push({
        block: block.id,
        problem: `itemsOf: ${block.itemsOf.block} is not a block of the store`
      })
      continue
    }
    const fields = fieldsOf(block, owner, (problem) => out.problems.push({ block: block.id, problem }))
    const { block: id, select, why } = block.itemsOf
    block.itemsOf = { block: id, select, fields, why }
  }
}

/** The records an item scope lists, in item order (test support and the sweep). */
export const itemRecordsOf = (block) =>
  (list(block.itemFields).find((f) => Array.isArray(f.slots))?.slots ?? []).flat(3).map(recordOf)
