/**
 * A content contract held to the demo database it was captured from: STAB-1 (condition 2, "the
 * contract was captured from THIS release") and STAB-6 ("the presentation lock matches the
 * release") read the same pairs of contract row and dump row.
 */
import { JOOMLA_TABLE_OF_KIND, rowsOfEntity } from './demo-database-tables.js'
import { htmlTextPieces, normalText } from './joomla-row-text.js'
import { counted } from './rule-findings.js'

/**
 * Each Joomla contract entity with the one dump row its identity names.
 * @param {import('./demo-database-tables.js').DemoDatabase} db
 * @param {any} contentMap
 * @returns {{ rows: Map<string, Record<string, any>>, problems: string[] }}
 */
export function joomlaEntityRows(db, contentMap) {
  const rows = new Map()
  const missing = []
  const several = []
  for (const entity of contentMap?.entities ?? []) {
    let hits = rowsOfEntity(db, entity, JOOMLA_TABLE_OF_KIND)
    if (hits === null) continue
    // Two rows may share an identity; the one the contract was cut from is its source id.
    if (hits.length > 1) hits = hits.filter((r) => String(r.id) === String(entity.sourceId))
    if (hits.length === 1) rows.set(entity.key, hits[0])
    else (hits.length ? several : missing).push(entity.key)
  }
  const problems = []
  if (missing.length)
    problems.push(
      `${counted(missing.length, 'contract entity is', 'contract entities are')} not in the demo database (${missing.slice(0, 6).join(', ')})`
    )
  if (several.length)
    problems.push(
      `${counted(several.length, 'contract entity names', 'contract entities name')} several rows (${several.slice(0, 6).join(', ')})`
    )
  return { rows, problems }
}

/**
 * The value a slot's `jsonPath` names in a JSON column (`params`, the nested `jatools-config`
 * when the slot says `nestedJson`), or undefined.
 * @param {unknown} column
 * @param {{ jsonPath?: (string | number)[], nestedJson?: string }} slot
 */
function atPath(column, slot) {
  try {
    let value = JSON.parse(String(column ?? 'null'))
    if (slot.nestedJson) value = JSON.parse(String(value?.[slot.nestedJson] ?? 'null'))
    for (const step of slot.jsonPath ?? []) value = value?.[step]
    return value
  } catch {
    return undefined
  }
}

/**
 * Whether a Joomla slot's sample is what its column holds in `row`: the value at its `jsonPath`,
 * or a text piece (text slots) or a substring (url, image) of an HTML column.
 * @param {Record<string, any>} row
 * @param {any} slot
 */
export function sampleIsInRow(row, slot) {
  const column = row?.[slot.column]
  const sample = normalText(slot.sample)
  // `xpath` beside `jsonPath`: one text of an HTML string stored in the JSON (`--full-coverage`).
  if (slot.jsonPath && !slot.xpath) return normalText(atPath(column, slot)) === sample
  const raw = String(slot.jsonPath ? (atPath(column, slot) ?? '') : (column ?? ''))
  if (slot.type !== 'text') return raw.includes(String(slot.sample)) || normalText(raw).includes(sample)
  // Inline markup (`<code>`, `<em>`) splits a sentence into pieces: compare with no white space at all.
  const bare = (/** @type {string} */ s) => s.replace(/\s+/g, '')
  // An attribute slot (`@alt`, `@title`) is not a text node: look in the raw column as well.
  return (
    sample === '' ||
    bare(htmlTextPieces(raw).join('')).includes(bare(sample)) ||
    bare(normalText(raw)).includes(bare(sample))
  )
}

/**
 * The fields of a lock row that differ from the dump row, as `field` names.
 * @param {Record<string, any>} lockRow
 * @param {Record<string, any>} dumpRow
 */
export function differingFields(lockRow, dumpRow) {
  return Object.keys(lockRow ?? {}).filter((k) => String(lockRow[k] ?? '') !== String(dumpRow?.[k] ?? ''))
}
