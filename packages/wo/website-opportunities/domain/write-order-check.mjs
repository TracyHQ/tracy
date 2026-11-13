// The check of a write order (ticket #597): the rules the write step relies on, read from the order alone. Pure: an
// order in, every problem out (`{code, at, message}`); nothing throws on a malformed order.
import { WRITE_ORDER_SCHEMA } from './write-order.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const PICTURE_SOURCES = new Set(['own', 'generated', 'none'])
const ACTIONS = new Set(['hide', 'fallback'])
const DATA_FROM = new Set(['data', 'no-data', 'derived'])

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

function entryProblems(e, facts, report) {
  const hasValue = e.value !== undefined && e.value !== null && e.value !== ''
  if (e.from === 'derived') {
    if (!isText(e.target?.page))
      report('derived_without_target', e.place, 'a derived link names its target page')
  } else if (!hasValue && !ACTIONS.has(e.action))
    report('entry_empty', e.place, 'an entry holds a value or an action (hide or fallback)')
  if (e.type === 'design') report('design_field', e.place, 'a design field is never written')
  if ((e.type === 'link' || e.type === 'number') && !DATA_FROM.has(e.from))
    report('link_not_from_data', e.place, `a ${e.type} value comes from the plan data, not from ${e.from}`)
  if (e.from === 'data') {
    if (!isText(e.data)) report('data_unnamed', e.place, 'a data value names the plan id it came from')
    const fact = facts.get(e.data)
    if (fact !== undefined && fact !== e.value)
      report('data_value_changed', e.place, `the value is not the plan's ${e.data}`)
  }
  if (e.type === 'text' && hasValue && Number.isInteger(e.limit) && [...String(e.value)].length > e.limit)
    report('text_over_limit', e.place, `${[...String(e.value)].length} characters for a limit of ${e.limit}`)
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
  const facts = new Map(list(order?.facts).map((f) => [f.data, f.value]))
  const answer = list(order?.facts).find((f) => f.kind === 'contact.cta_label' && f.from === 'answer')?.value
  const pictures = list(order?.pictures)
  const icons = list(order?.icons)
  const counted = new Map()
  const count = (place) => counted.set(place, (counted.get(place) ?? 0) + 1)
  for (const p of pictures) count(p.frame)
  for (const i of icons) count(i.id)
  const entries = new Map()
  for (const { place } of placesOfOrder(order))
    for (const e of list(place.fields)) {
      count(e.place)
      entries.set(e.place, e)
      entryProblems(e, facts, report)
      if (
        e.kind === 'contact.cta_label' &&
        answer !== undefined &&
        (e.from !== 'answer' || e.value !== answer)
      )
        report(
          'main_button_changed',
          e.place,
          'the main button label is the customer answer, character for character'
        )
    }
  for (const { block, place } of placesOfOrder(order)) {
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
  for (const g of placesOfOrder(order).flatMap(({ place }) => list(place.lists)))
    if (g.state === 'show' && g.counts && g.counts.shown < g.counts.min)
      report('below_min', g.list, `${g.counts.shown} rows shown for min ${g.counts.min}`)
  const frames = new Set(pictures.map((p) => p.frame))
  for (const p of pictures) {
    if (!PICTURE_SOURCES.has(p.source))
      report('picture_source', p.frame, `${p.source} is not own, generated or none`)
    if (p.stock === true || p.generate?.stock === true)
      report('stock_picture', p.frame, 'a stock picture is never used')
    if (p.sameAs !== undefined && !frames.has(p.sameAs))
      report('same_as_missing', p.frame, `${p.sameAs} is no frame`)
    if (p.source === 'own' && !p.file && !p.ref)
      report('picture_without_file', p.frame, 'an own picture names its file')
    if (p.source === 'generated' && !p.file && !p.generate)
      report('picture_without_file', p.frame, 'a generated picture names its file or how it is drawn')
  }
  for (const i of icons) {
    if (i.case !== 'social' || i.source !== 'none' || !isText(i.link)) continue
    const link = entries.get(i.hidesLink)
    if (!link || link.action !== 'hide')
      report('network_link_shown', i.id, 'a hidden network icon hides its link')
  }
  for (const d of list(order?.derived))
    if (!pageIds.has(d.target?.page))
      report('derived_target_missing', d.place, 'the target is no page of the order')
  for (const u of list(order?.unplaced))
    report('entry_unplaced', u.place, 'a written entry has no place in the plan')
  return problems
}
