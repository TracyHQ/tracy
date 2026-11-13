// The field entry rules of `checkWriteOrder` (ticket #597): values, data, buttons and limits, read from the order
// alone. Pure; nothing throws on a malformed order.
import { DATA_ROLES } from './page-writer-roles.mjs'
import { SOCIAL_URL_KINDS } from './picture-block-places.mjs'
import { networkNameOf, TEXT_OF_NETWORK } from './row-network-text.mjs'
import { MAIN_BUTTON_LABEL, MAIN_BUTTON_LINK, linkOpens } from './write-order-buttons.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const ACTIONS = new Set(['hide', 'fallback'])
const DATA_FROM = new Set(['data', 'no-data', 'derived'])
const TEXT_DATA_FROM = new Set(['data', 'answer', 'no-data'])
const hasValue = (e) => e.value !== undefined && e.value !== null && e.value !== ''
const asText = (value) => (typeof value === 'number' ? String(value) : value)

/** Every plan id the order names, by id: `{what: 'fact' | 'item' | 'row' | 'source', ...}`. */
export function dataIndexOfOrder(order) {
  const ids = new Map()
  for (const f of list(order?.facts)) ids.set(f.data, { what: 'fact', kind: f.kind, value: f.value })
  for (const i of list(order?.items)) ids.set(i.data, { what: 'item', values: i.values ?? {} })
  for (const r of list(order?.rows)) ids.set(r.data, { what: 'row', values: r.values ?? {} })
  for (const s of list(order?.sources)) ids.set(s.data, { what: 'source' })
  return ids
}

/** Whether a data value is the value the plan id holds. */
function sameAsPlan(e, held) {
  if (held.what === 'source') return true
  if (held.what === 'fact') return held.value === e.value
  return list(held.values?.[e.kind]).map(asText).includes(asText(e.value))
}

/**
 * The problems of every entry of the order.
 * @param {Array<{place: object}>} places `placesOfOrder(order)`
 * @param {object} order the order
 * @param {Map<string, object>} entries every entry by place id
 * @param {(code: string, at: string, message: string) => void} report
 */
export function entryProblems(places, order, entries, report) {
  const ids = dataIndexOfOrder(order)
  const answer = list(order?.facts).find((f) => f.kind === MAIN_BUTTON_LABEL && f.from === 'answer')?.value
  const seen = new Map()
  for (const { place } of places)
    for (const e of list(place.fields)) {
      if (e.from === 'derived') {
        if (!isText(e.target?.page))
          report('derived_without_target', e.place, 'a derived link names its target page')
      } else if (!hasValue(e) && !ACTIONS.has(e.action))
        report('entry_empty', e.place, 'an entry holds a value or an action (hide or fallback)')
      if (e.type === 'design') report('design_field', e.place, 'a design field is never written')
      if ((e.type === 'link' || e.type === 'number') && !DATA_FROM.has(e.from))
        report(
          'link_not_from_data',
          e.place,
          `a ${e.type} value comes from the plan data, not from ${e.from}`
        )
      if (e.type === 'text' && DATA_ROLES.includes(e.kind) && hasValue(e) && !TEXT_DATA_FROM.has(e.from))
        report('data_role_written', e.place, `a ${e.kind} text is the plan data, never written copy`)
      if (e.from === 'data') {
        const held = ids.get(e.data)
        if (!isText(e.data)) report('data_unnamed', e.place, 'a data value names the plan id it came from')
        else if (!held) report('data_unknown', e.place, `${e.data} is no plan id of the order`)
        else if (e.textOf === TEXT_OF_NETWORK) {
          const link = list(place.fields).find((f) => SOCIAL_URL_KINDS.includes(f.kind) && hasValue(f))
          if (!link || networkNameOf(link.value) !== e.value)
            report('network_label_changed', e.place, 'a network label names the network of its row link')
        } else if (!sameAsPlan(e, held))
          report('data_value_changed', e.place, `the value is not the plan's ${e.data}`)
        if (held?.what === 'fact' && e.textOf === undefined) {
          const key = `${e.data}|${e.kind}`
          seen.set(key, [...(seen.get(key) ?? []), e.value])
        }
      }
      if (
        e.type === 'text' &&
        hasValue(e) &&
        Number.isInteger(e.limit) &&
        [...String(e.value)].length > e.limit
      )
        report(
          'text_over_limit',
          e.place,
          `${[...String(e.value)].length} characters for a limit of ${e.limit}`
        )
      const link = e.type === 'text' && isText(e.button) ? entries.get(e.button) : null
      const main = e.kind === MAIN_BUTTON_LABEL || link?.kind === MAIN_BUTTON_LINK
      if (main && answer !== undefined && hasValue(e) && (e.from !== 'answer' || e.value !== answer))
        report(
          'main_button_changed',
          e.place,
          'the main button label is the customer answer, character for character'
        )
      if (e.type === 'text' && isText(e.button) && hasValue(e) && !linkOpens(link))
        report('link_dead', e.place, 'a button label is written only with a link that opens something')
    }
  for (const [key, values] of seen)
    if (new Set(values).size > 1)
      report('data_value_differs', key.split('|')[0], 'one fact reads the same everywhere')
}
