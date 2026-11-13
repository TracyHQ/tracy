// The child list rows a page writer call fills (ticket #615): every declared field of every row the plan holds in a
// block's `lists` (`plan-rows.mjs`), nested rows included, each with where its value comes from, like the other
// fields (`page-writer-fields.mjs`):
//
//   from: 'writer'   a COPY text field (`page-writer-roles.mjs`): the model writes it from the row's data
//   from: 'data'     a DATA text field, or a link or number field, whose value the row's data holds: copied in code.
//                    When a row value has parts (`needs-profile-rows.mjs`), the n-th field of that data kind in the
//                    row takes the n-th part: the days, then the times, of one session
//   from: 'no-data'  a field the row's data does not hold (`action: 'hide'`), a link the write step derives
//                    (`action: 'derived'`, the page of the row), a network icon drawn from the network of the row's
//                    link (`action: 'network'`, a class of the template's icon font) or a picture, video or icon
//                    field the pictures step fills (`action: 'pictures'`). Never asked of the model.
//
// A row's place id is `<list>.<n>`, nested `<list>.<n>.<list>.<n>` (n from 1), the row id of the pictures step
// (`picture-block-places.mjs`), so the icon step reads the written row text by it (`icon-copy.mjs`).
import { roleOrigin } from './page-writer-roles.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const MEDIA = new Set(['image', 'icon'])
const isMedia = (field) => MEDIA.has(field?.type) || field?.kind === 'business.video'

/** The values of a planned row by data kind, as parts: a row's own values, a fact's value, or none for a page. */
function valuesOfRow(row, data) {
  if (row.data === undefined) return {}
  const record = data.rowsById?.get(row.data)
  if (record) return record.values
  const fact = data.byId.get(row.data)
  return fact?.what === 'fact' ? { [fact.kind]: [String(fact.entry.value)] } : {}
}

/** Where one field of a row takes its value from (see the header). */
function originOfRowField(field, values, rank, originOf, at) {
  if (field?.type === 'design') return null
  if (field?.iconOf === 'network') return { from: 'no-data', action: 'network' }
  if (isMedia(field)) return { from: 'no-data', action: 'pictures' }
  if (field?.derived !== undefined) return { from: 'no-data', action: 'derived', derived: field.derived }
  const text = field?.type === 'text'
  const origin = text ? originOf(field, at) : roleOrigin(field?.kind) === 'not-text' ? 'none' : 'data'
  if (origin === 'copy') return { from: 'writer' }
  const part = values[field?.kind]?.[rank]
  return part === undefined ? { from: 'no-data', action: 'hide' } : { from: 'data', value: part }
}

/**
 * The fields of the planned rows of one block, every declared field of every row, in list and row order.
 * @param {object} block the planned block (with `lists`)
 * @param {object} description its block description
 * @param {{data: object, base: (field: object, item?: string) => object, originOf: Function}} context `base` makes
 *   the common part of an entry (`key`, `page`, `block`, `item`, `field`); `originOf` classifies a text field
 */
export function rowFieldsOf(block, description, { data, base, originOf }) {
  const out = []
  const walk = (child, planned, item, prefix) => {
    list(planned?.rows).forEach((row, k) => {
      const id = prefix ? `${prefix}.${child.name}.${k + 1}` : `${child.name}.${k + 1}`
      const values = valuesOfRow(row, data)
      const seen = new Map()
      for (const field of list(child.fields)) {
        const rank = seen.get(field?.kind) ?? 0
        seen.set(field?.kind, rank + 1)
        const origin = originOfRowField(
          field,
          values,
          rank,
          originOf,
          `${description.id}.${id}.${field?.name}`
        )
        if (!origin) continue
        const entry = base(field, item, id)
        out.push({
          ...entry,
          row: id,
          list: child.name,
          ...(row.data === undefined ? { rowPage: row.page } : { rowData: row.data }),
          ...origin,
          ...(origin.from === 'data' ? { data: row.data } : {})
        })
      }
      const nested = new Map(list(row.lists).map((n) => [n.name, n]))
      for (const n of list(child.lists)) walk(n, nested.get(n.name), item, id)
    })
  }
  for (const planned of list(block.lists)) {
    const key = planned.item === undefined ? 'lists' : 'itemLists'
    const child = list(description[key]).find((c) => c.name === planned.name)
    if (child) walk(child, planned, planned.item, '')
  }
  return out
}

/** The row data a writer call reads as context: each planned row's values, by row id. */
export function rowContextOf(fields) {
  const rows = new Map()
  for (const f of fields) {
    if (!f.row || rows.has(`${f.item ?? ''}|${f.row}`)) continue
    rows.set(`${f.item ?? ''}|${f.row}`, {
      row: f.row,
      ...(f.item ? { item: f.item } : {}),
      ...(f.rowData ? { data: f.rowData } : { page: f.rowPage })
    })
  }
  return [...rows.values()]
}

/**
 * Whether a row value is data a copy field could leak, not an ordinary word: it holds a digit (a time, a price, a
 * phone number, a date), it is a link or an email address, or it is a phrase of at least 3 words. A single word or a
 * short name ("Glaze", "Mon", "Odile Brannoch") never is: copy may use it freely.
 */
export const isDataLike = (value) =>
  /\p{N}/u.test(value) ||
  /@|:\/\/|^www\.|\.[a-z]{2,}\//i.test(value) ||
  String(value).trim().split(/\s+/).length >= 3

/**
 * The data like values (`isDataLike`) of every OTHER row of the plan data, for the copy check of a row's copy field
 * (`other_row_data`): a tip of one step must not carry the times of a session. The row's own values and its parent
 * rows' values are its own.
 */
export function foreignValuesOf(rowData, data) {
  const own = new Set()
  for (let id = rowData; id; id = data.rowsById?.get(id)?.parent)
    for (const parts of Object.values(data.rowsById?.get(id)?.values ?? {})) for (const p of parts) own.add(p)
  const out = new Set()
  for (const [id, record] of data.rowsById ?? new Map())
    if (id !== rowData)
      for (const parts of Object.values(record.values))
        for (const p of parts) if (!own.has(p) && isDataLike(p)) out.add(p)
  return [...out]
}
