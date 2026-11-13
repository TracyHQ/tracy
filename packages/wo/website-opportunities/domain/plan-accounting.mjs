// The data accounting of a plan (ticket #593): every fact and every item of the needs profile is shown in a block the
// model placed, placed by the gate's rules, or left out with a reason. Nothing disappears without a report. The rules
// gate holds every plan to it (`data_unaccounted`), and the tests count it: total = shown + placed + left out.
// A fact that stands for an item field (`plan-conflicts.mjs`) counts with its item.

/**
 * @param {{data: object, pages: object[], placed: Array<{item: string}>, leftOutIds: Set<string>}} input `pages`: the
 *   plan's final pages; `leftOutIds`: the ids every left out entry reports
 * @returns {{total: number, shown: string[], placed: string[], leftOut: string[], unexplained: string[]}}
 */
export function dataAccountingOf({ data, pages, placed, leftOutIds }) {
  const onPages = new Set(pages.flatMap((p) => p.blocks.flatMap((b) => b.data)))
  const byGate = new Set(placed.map((p) => p.item))
  const out = { total: 0, shown: [], placed: [], leftOut: [], unexplained: [] }
  const where = (id) => {
    if (onPages.has(id)) return byGate.has(id) ? 'placed' : 'shown'
    return leftOutIds.has(id) ? 'leftOut' : 'unexplained'
  }
  for (const [id, record] of data.byId) {
    out.total += 1
    out[where(record.itemField ? record.itemField.item : id)].push(id)
  }
  return out
}
