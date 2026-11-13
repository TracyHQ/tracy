// The check of a write order (ticket #597): the rules the write step relies on, read from the order alone. Pure: an
// order in, every problem out (`{code, at, message}`); nothing throws on a malformed order. The entry rules are in
// `write-order-check-entries.mjs`, the place, picture, icon and page rules in `write-order-check-places.mjs`; the
// codes are listed in docs/references/write-order.md.
import { WRITE_ORDER_SCHEMA } from './write-order.mjs'
import { entryProblems } from './write-order-check-entries.mjs'
import { iconProblems, pageProblems, pictureProblems, stateProblems } from './write-order-check-places.mjs'

const list = (value) => (Array.isArray(value) ? value : [])

/** Every place of an order with its state: blocks, items and child list rows. */
export function placesOfOrder(order) {
  const out = []
  for (const page of list(order?.pages))
    for (const block of list(page.blocks)) {
      out.push({ page, block, place: block })
      for (const item of list(block.items)) {
        out.push({ page, block, place: item })
        for (const g of list(item.lists))
          for (const row of list(g.rows)) out.push({ page, block, place: row })
      }
      for (const g of list(block.lists)) for (const row of list(g.rows)) out.push({ page, block, place: row })
    }
  return out
}

/** Every declared non-design field of a shown place has exactly one entry; a design field has none. */
function coverageProblems(places, counted, report) {
  for (const { block, place } of places) {
    if (place.state !== 'show') continue
    for (const field of list(place.declared)) {
      const id = `${place.at}.${field.name}`
      const n = counted.get(id) ?? 0
      if (field.type === 'design') {
        if (n > 0) report('design_field', id, 'a design field is never in the order')
      } else if (n !== 1)
        report(n === 0 ? 'field_unaccounted' : 'field_twice', id, `${n} entries for a declared field`)
    }
    if (
      place === block &&
      block.counts &&
      block.counts.shown < block.counts.min &&
      list(block.items).length > 0
    )
      report('below_min', block.at, `${block.counts.shown} items shown for min ${block.counts.min}`)
  }
  for (const g of places.flatMap(({ place }) => list(place.lists)))
    if (g.state === 'show' && g.counts && g.counts.shown < g.counts.min)
      report('below_min', g.at ?? g.list, `${g.counts.shown} rows shown for min ${g.counts.min}`)
}

/**
 * Check a write order.
 * @param {object} order a `tracy-write-order/v1` document (`buildWriteOrder`)
 * @returns {Array<{code: string, at: string, message: string}>}
 */
export function checkWriteOrder(order) {
  const problems = []
  const report = (code, at, message) => problems.push({ code, at, message })
  if (order?.schema !== WRITE_ORDER_SCHEMA)
    report('schema', 'schema', `schema must be "${WRITE_ORDER_SCHEMA}"`)
  const pages = list(order?.pages)
  const homes = pages.filter((p) => p.home === true)
  if (homes.length !== 1) report('home_count', 'pages', `${homes.length} home pages: exactly one`)
  else if (pages[0] !== homes[0]) report('home_not_first', 'pages', 'the home page is written first')
  const pageIds = new Set(pages.map((p) => p.id))
  if (pageIds.size !== pages.length) report('page_repeated', 'pages', 'a page id appears twice')
  const places = placesOfOrder(order)
  const counted = new Map()
  const count = (place) => counted.set(place, (counted.get(place) ?? 0) + 1)
  for (const p of list(order?.pictures)) count(p.frame)
  for (const i of list(order?.icons)) count(i.id)
  const entries = new Map()
  for (const { place } of places)
    for (const e of list(place.fields)) {
      count(e.place)
      entries.set(e.place, e)
    }
  entryProblems(places, order, entries, report)
  stateProblems(places, order, report)
  coverageProblems(places, counted, report)
  pictureProblems(order, report)
  iconProblems(order, entries, report)
  pageProblems(order, report)
  for (const d of list(order?.derived))
    if (!pageIds.has(d.target?.page))
      report('derived_target_missing', d.place, 'the target is no page of the order')
  for (const u of list(order?.unplaced))
    report('entry_unplaced', u.place, 'a written entry has no place in the plan')
  return problems
}
