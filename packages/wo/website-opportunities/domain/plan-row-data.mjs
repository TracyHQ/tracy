// The row data a build plan may show (ticket #615): every row of the needs profile (`needs-profile-rows.mjs`), of an
// item or of the business, nested rows included, gets a plan id, a label and its sources, like facts and items
// (`plan-data.mjs`). A person's own profile link field (`person.social_url`) is a row of that person too: Contract A
// keeps a trainer's links as a child list. The plan names rows only by these ids (`plan-rows.mjs`), so a planned row
// always stands for something the business stated. Pure.
import { partsOf } from './needs-profile-rows.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isText = (value) => typeof value === 'string' && value.trim() !== ''
const PERSON_LINK = 'person.social_url'

/** The values of a row by data kind, each as its parts (`partsOf`); a field without text is left out. */
export function rowValuesOf(fields) {
  const out = {}
  for (const [role, field] of Object.entries(fields ?? {})) {
    const parts = partsOf(field?.value)
    if (parts) out[role] = parts
  }
  return out
}

/**
 * The row records of a profile.
 * @param {object} profile a needs profile
 * @param {{byId: Map<string, object>}} data the plan data of the same profile (`planDataOf`), for the item owners
 * @param {{sourcesOf: Function, short: Function, origins: Map<string, string>}} helpers from `plan-data.mjs`
 * @returns {{rows: Array<{id: string, label: string, sources: object[]}>, rowsById: Map<string, {id: string,
 *   owner: string | null, parent: string | null, values: Record<string, string[]>, entry: object, rows: string[]}>,
 *   rowsOf: (owner: string | null) => string[]}} `owner`: the item id, or null for the business; `parent`: the row
 *   a nested row belongs to; `rows`: its own rows' ids
 */
export function rowDataOf(profile, data, { sourcesOf, short, origins }) {
  const rows = []
  const rowsById = new Map()
  const byOwner = new Map()
  const add = (row, owner, parent, inherited) => {
    const values = rowValuesOf(row?.fields)
    if (!isText(row?.id) || rowsById.has(row.id) || data.byId.has(row.id)) return null
    if (Object.keys(values).length === 0) return null
    const sources = sourcesOf(list(row.sources).length ? row.sources : inherited, origins)
    if (sources.length === 0) return null
    const label = short(Object.values(values).flat().join(', '))
    const entry = { id: row.id, label, sources }
    const record = { id: row.id, owner, parent, values, entry, rows: [] }
    rows.push(entry)
    rowsById.set(row.id, record)
    for (const child of list(row.rows)) {
      const kept = add(child, owner, row.id, list(row.sources).length ? row.sources : inherited)
      if (kept) record.rows.push(kept.id)
    }
    return record
  }
  const top = (owner, row, inherited) => {
    const record = add(row, owner, null, inherited)
    if (!record) return
    if (!byOwner.has(owner)) byOwner.set(owner, [])
    byOwner.get(owner).push(record.id)
  }
  for (const row of list(profile?.rows)) top(null, row, [])
  for (const values of Object.values(profile?.items ?? {}))
    for (const item of list(values)) {
      if (data.byId.get(item?.id)?.what !== 'item') continue
      for (const row of list(item.rows)) top(item.id, row, item.sources)
      const link = item.fields?.[PERSON_LINK]
      const stated = list(item.rows).some((r) => r?.fields?.[PERSON_LINK]?.value === link?.value)
      if (isText(link?.value) && !stated)
        top(item.id, { id: `${item.id}-link`, fields: { [PERSON_LINK]: link } }, link.sources ?? item.sources)
    }
  return { rows, rowsById, rowsOf: (owner) => byOwner.get(owner ?? null) ?? [] }
}
