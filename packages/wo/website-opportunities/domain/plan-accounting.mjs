// The data accounting of a plan (ticket #593): every fact and every item of the needs profile is shown in a block the
// model placed, placed by the gate's rules, or left out with a reason. Nothing disappears without a report. The rules
// gate holds every plan to it (`data_unaccounted`), and the tests count it: total = shown + placed + left out.
// A fact that stands for an item field (`plan-conflicts.mjs`) counts with its item. Rows of the profile (ticket #615)
// count too: shown when a child list of the plan holds them, left out with their item (left out, or shown on no page)
// or parent row, or reported. A fact a list holds as a row (a social link) is shown.

const list = (value) => (Array.isArray(value) ? value : [])

/** Every data id the child lists of the pages hold, nested lists included. */
export function rowDataIdsOf(pages) {
  const out = new Set()
  const walk = (lists) => {
    for (const l of list(lists))
      for (const row of list(l?.rows)) {
        if (row?.data) out.add(row.data)
        walk(row?.lists)
      }
  }
  for (const page of list(pages)) for (const block of list(page?.blocks)) walk(block?.lists)
  return out
}

/**
 * @param {{data: object, pages: object[], placed: Array<{item: string}>, leftOutIds: Set<string>}} input `pages`: the
 *   plan's final pages; `leftOutIds`: the ids every left out entry reports
 * @returns {{total: number, shown: string[], placed: string[], leftOut: string[], unexplained: string[]}}
 */
export function dataAccountingOf({ data, pages, placed, leftOutIds }) {
  const inRows = rowDataIdsOf(pages)
  const onPages = new Set([...pages.flatMap((p) => p.blocks.flatMap((b) => b.data)), ...inRows])
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
  for (const [id, record] of data.rowsById ?? new Map()) {
    out.total += 1
    if (inRows.has(id)) out.shown.push(id)
    else if (leftOutIds.has(id) || leftOutIds.has(record.parent) || leftOutIds.has(record.owner))
      out.leftOut.push(id)
    else if (record.parent !== null && !inRows.has(record.parent)) out.leftOut.push(id)
    // A row of an item no page shows goes with its item, which the item accounting reports.
    else if (record.owner !== null && !onPages.has(record.owner)) out.leftOut.push(id)
    else out.unexplained.push(id)
  }
  return out
}
