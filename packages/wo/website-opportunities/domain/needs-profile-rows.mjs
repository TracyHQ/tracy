// Row shaped facts of the needs profile (ticket #615): the rows a business states inside one of its items (the
// session times of a class, the steps of a project) or for itself (the lines of its opening times). Contract A child
// lists (`lists`, `itemLists`) show them; the plan holds them by id (`plan-row-data.mjs`).
//
// The model reads a row as `{fields: {"<data kind>": value | [part, ...]}, evidence, rows?: [...]}`. A value may be a
// list of the parts the source writes apart, in the order it writes them (the days, then the times, of one session):
// the n-th field of that data kind in a list's row shows the n-th part. Every row carries its own evidence, found in
// the words of the source its item cites, and is grounded like any other fact (`needs-profile-grounding.mjs`): a
// literal value or part its evidence does not hold drops the whole row, a summary that says more drops that field.
// Nothing is set aside silently: every row or field left out is listed in `dropped` with a code and a reason.
import { textKey } from './needs-profile-merge.mjs'
import { SUMMARY_ROLES, provenBy } from './needs-profile-grounding.mjs'
import { roleOrigin } from './page-writer-roles.mjs'
import { ROLE_VOCABULARY_V3, isRole } from './place-content-roles.mjs'

/** How many parts one row value may hold, and how deep rows may nest (a row of a row of a row). */
export const MAX_ROW_PARTS = 4
export const MAX_ROW_DEPTH = 3

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''

/** Whether a row may hold a field of data kind `role`: a business value, never page words or a picture. */
export const isRowRole = (role) =>
  isRole(role, ROLE_VOCABULARY_V3) &&
  !role.startsWith('editorial.') &&
  roleOrigin(role) !== null &&
  roleOrigin(role) !== 'not-text'

/** The parts of a row value: one text, or a list of 1 to `MAX_ROW_PARTS` texts; null when it is neither. */
export function partsOf(value) {
  if (isText(value)) return [value.trim()]
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_ROW_PARTS) return null
  return value.every(isText) ? value.map((v) => v.trim()) : null
}

/**
 * The grounded rows of one model observation.
 * @param {unknown} rows the observation's `rows`
 * @param {{quoted: (obs: object, what: object) => object | null, drop: Function, dropped: object[],
 *   what: object, source?: {id: string}, sourceOf?: (row: object) => object | null}} context `quoted` checks a row's
 *   evidence in the observation's source (and records the drop); `what` names the observation in every drop;
 *   `sourceOf` (business rows) gives each top level row the source it cites, kept on the row as `source`
 * @returns {Array<{fields: Record<string, string | string[]>, rows?: object[]}>}
 */
export function groundRows(rows, context, path = 'rows', depth = 1) {
  const { quoted, drop, dropped, what, sourceOf } = context
  const kept = []
  list(rows).forEach((row, i) => {
    const source = sourceOf ? sourceOf(row) : context.source
    if (!source) return dropped.push(drop('unknown_source', { ...what, row: `${path}[${i}]` }))
    const at = { ...what, source: source.id, row: `${path}[${i}]` }
    if (depth > MAX_ROW_DEPTH) return dropped.push(drop('row_too_deep', at))
    if (!quoted({ source: source.id, evidence: row?.evidence }, at)) return
    const fields = {}
    for (const [role, value] of Object.entries(row?.fields ?? {})) {
      const parts = partsOf(value)
      if (!isRowRole(role)) dropped.push(drop('unknown_kind', { ...at, field: role }, 'field'))
      else if (!parts) dropped.push(drop('not_text', { ...at, field: role }, 'field'))
      else fields[role] = parts
    }
    // A literal part the quote does not prove drops the whole row; a summary that says more drops that field only.
    const unproven = Object.entries(fields).filter(([role, parts]) =>
      parts.some((p) => !provenBy(role, p, row.evidence))
    )
    const literal = unproven.find(([role]) => !SUMMARY_ROLES.includes(role))
    if (literal)
      return dropped.push(drop('value_not_in_evidence', { ...at, field: literal[0], value: literal[1] }))
    for (const [role, parts] of unproven) {
      dropped.push(drop('summary_not_in_evidence', { ...at, field: role, value: parts }, 'field'))
      delete fields[role]
    }
    if (Object.keys(fields).length === 0) return dropped.push(drop('row_without_fields', at))
    const nested = { quoted, drop, dropped, what, source }
    const children = groundRows(row.rows, nested, `${at.row}.rows`, depth + 1)
    const value = Object.fromEntries(Object.entries(fields).map(([r, p]) => [r, p.length === 1 ? p[0] : p]))
    kept.push({
      fields: value,
      ...(children.length ? { rows: children } : {}),
      ...(sourceOf ? { source } : {})
    })
  })
  return kept
}

/** Two rows say the same thing: the same data kinds with the same words. */
const rowKey = (row) =>
  JSON.stringify(
    Object.keys(row.fields)
      .sort()
      .map((role) => [role, partsOf(row.fields[role]).map(textKey)])
  )

/**
 * The rows of one item (or of the business) from the rows of its observations, most trusted source first: a row two
 * sources state the same way is one row with both sources. Ids are `<owner id>-row-<n>`, nested `<row id>-row-<n>`.
 * @param {Array<{fields: object, rows?: object[], source: {id: string}}>} observed
 * @returns {Array<{id: string, fields: Record<string, {value: string | string[]}>, sources: string[], rows?: object[]}>}
 */
export function mergeRows(observed, owner) {
  const merged = []
  for (const row of observed) {
    const key = rowKey(row)
    const found = merged.find((m) => m.key === key)
    if (found) {
      if (!found.sources.includes(row.source.id)) found.sources.push(row.source.id)
      found.children.push(...list(row.rows).map((r) => ({ ...r, source: row.source })))
      continue
    }
    merged.push({
      key,
      fields: row.fields,
      sources: [row.source.id],
      children: list(row.rows).map((r) => ({ ...r, source: row.source }))
    })
  }
  return merged.map((m, n) => {
    const id = `${owner}-row-${n + 1}`
    const rows = mergeRows(m.children, id)
    return {
      id,
      fields: Object.fromEntries(Object.entries(m.fields).map(([role, value]) => [role, { value }])),
      sources: m.sources,
      ...(rows.length ? { rows } : {})
    }
  })
}
