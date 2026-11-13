// Whether a business row can fill a row of a child list (ticket #615), decided before the plan holds it, so the page
// writer never meets a row it cannot write. Pure. A row that cannot is dropped with a code and the customer's reason
// (`CHILD_LIST_REASONS`); the plan reports it in its left out list.
//
// - `row_parts_over_fields`: a value written as more parts than the list has fields of that data kind (three parts of
//   a schedule for a day field and a time field): no part is lost or moved, the row is not shown. Parts of one data
//   kind fill the fields of that kind in the order the source writes them.
// - `row_value_over_limit`: a part longer than the field it fills holds (the smallest limit of a stored place the
//   field shares, `field-place-limits.mjs`): a data value is never shortened.
// - A list with a link field of a social kind takes its links by the icon step's rules (`icon-row-links.mjs`): a
//   shortened link, a host that is no known network, a bare handle and a second link to one network never take a row.
import { rowLinksOf, linkFieldOf } from './icon-row-links.mjs'
import { limitOf } from './field-place-limits.mjs'
import { roleOrigin } from './page-writer-roles.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const charCount = (value) => [...String(value)].length
const ROOM = 'The section that shows these has room for fewer rows than you have.'

/** Every code a row or list of the rows report carries, with the customer's reason. No dashes. */
export const CHILD_LIST_REASONS = Object.freeze({
  row_beyond_stored_places: ROOM,
  row_over_max: ROOM,
  row_field_undeclared: 'The section shows only part of this row.',
  row_parts_over_fields: 'This row has more parts than the section has places for, so it is not shown.',
  row_value_over_limit: 'This row is longer than the section can show, so it is not shown.',
  social_link_shortened: 'This is a shortened link, so the network it leads to is unknown.',
  social_network_unknown: 'This link is not on a social network the section can show.',
  social_handle_without_network: 'This handle does not say which network it is on.',
  social_link_not_web: 'This is not a web link.',
  no_social_link: 'There is no link to show.',
  social_network_repeated: 'Another link to the same network is already shown.',
  social_link_over_rows: ROOM,
  list_below_min: 'This section shows fewer rows than the template lays out; the rest stay empty.'
})
/** The reason of a left out row the rules never planned at all. */
export const NO_LIST_REASON = 'No section of the template shows rows like this one.'
/** Every reason a left out row may carry, to tell row entries from other left out entries. */
export const ROW_REASONS = new Set([...Object.values(CHILD_LIST_REASONS), NO_LIST_REASON])

/** A rows report entry: its code and the customer's reason. */
export const reported = (at, code) => ({ ...at, code, reason: CHILD_LIST_REASONS[code] })

/** The fields of a list that take a row's data: text fields of a data kind, links and numbers; not derived. */
const dataFields = (child) =>
  list(child?.fields).filter(
    (f) =>
      f?.type !== 'design' &&
      f?.type !== 'image' &&
      f?.type !== 'icon' &&
      f?.derived === undefined &&
      typeof f?.kind === 'string' &&
      roleOrigin(f.kind) === 'data'
  )

/** Why the row values (data kind -> parts) cannot fill a row of `child`, or null when they can. */
export function rowMisfitOf(child, values, placeLimits) {
  const fields = dataFields(child)
  for (const [kind, parts] of Object.entries(values ?? {})) {
    const own = fields.filter((f) => f.kind === kind)
    if (own.length === 0) continue
    if (parts.length > own.length) return 'row_parts_over_fields'
    if (parts.some((part, n) => charCount(part) > limitOf(own[n], placeLimits))) return 'row_value_over_limit'
  }
  return null
}

/**
 * The candidates of one list for one parent, fitted and cut: `{kept, dropped}` with each dropped `{candidate, code}`.
 * @param {object} child the list's declaration
 * @param {Array<{data?: string, page?: string, values: object}>} candidates in data order
 * @param {number} room how many rows the parent place holds
 */
export function fitCandidates(child, candidates, room, placeLimits) {
  const dropped = []
  const fitting = []
  for (const c of candidates) {
    const code = c.page === undefined ? rowMisfitOf(child, c.values, placeLimits) : null
    if (code) dropped.push({ candidate: c, code })
    else fitting.push(c)
  }
  const link = linkFieldOf(list(child?.fields))
  if (!link) {
    const over = room < (child?.items?.max ?? 0) ? 'row_beyond_stored_places' : 'row_over_max'
    for (const c of fitting.slice(room)) dropped.push({ candidate: c, code: over })
    return { kept: fitting.slice(0, room), dropped }
  }
  // A social list: the icon step's link rules decide which rows show, in order.
  const urls = fitting.map((c) => c.values[link.kind]?.[0] ?? '')
  const { links, left } = rowLinksOf(urls, room)
  // `rowLinksOf` reads the links in order and gives each one either a row or a left out entry, also in order.
  const kept = []
  let [shown, out] = [0, 0]
  fitting.forEach((c, i) => {
    if (links[shown] === urls[i]) {
      shown += 1
      kept.push(c)
    } else dropped.push({ candidate: c, code: left[out++].reason })
  })
  return { kept, dropped }
}
