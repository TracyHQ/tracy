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
 * Whether an empty T3 logo param stands for the picture the header prints in its place: with `logotype`
 * image, T3 falls back to `templates/<tpl>/images/logo.png` (else the T3 base one), and capture-contract.py
 * (`--template-style-logos`) declares the slot with that path. `logoimage_sm` only when it is switched on.
 * @param {Record<string, any>} row the template style @param {any} slot
 */
function isT3DefaultLogo(row, slot) {
  const key = slot.jsonPath?.length === 1 ? String(slot.jsonPath[0]) : ''
  const file = { logoimage: 'logo.png', logoimage_sm: 'logo-sm.png' }[key]
  const params = (() => {
    try {
      return JSON.parse(String(row?.params ?? '{}')) ?? {}
    } catch {
      return {}
    }
  })()
  if (slot.type !== 'image' || !file || params.logotype !== 'image') return false
  if (key === 'logoimage_sm' && String(params.enable_logoimage_sm ?? '') !== '1') return false
  const sample = String(slot.sample)
  return (
    sample === `templates/${row?.template}/images/${file}` ||
    sample === `plugins/system/t3/base/images/${file}`
  )
}

/** One tag of the content map's inline markup notation, without its double parentheses: `span class="a"`, `/span`, `br/`. */
const NOTATION_TAG = /^\/?[a-zA-Z][a-zA-Z0-9]*(?:\s[^()]*)?\/?$/

/**
 * A sample with the content map's inline markup notation (`((tag attrs))`, `((/tag))`, `((br/))`, written by
 * capture-contract.py `--inline-markup` through unit-markup.php) read as markup: each tag becomes a space, as
 * capture's `plain_text` and the kit's `partsOf` read it. Double parentheses that hold no tag stay words.
 * An indexOf loop, not a global regex, so a long sample costs one pass.
 * @param {string} sample
 */
function withoutNotation(sample) {
  let out = ''
  let from = 0
  for (;;) {
    const open = sample.indexOf('((', from)
    if (open < 0) break
    const close = sample.indexOf('))', open + 2)
    if (close < 0) break
    if (NOTATION_TAG.test(sample.slice(open + 2, close))) {
      out += `${sample.slice(from, open)} `
      from = close + 2
    } else {
      out += sample.slice(from, open + 2)
      from = open + 2
    }
  }
  return out + sample.slice(from)
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
  if (slot.jsonPath && !slot.xpath) {
    const value = normalText(atPath(column, slot))
    return value === sample || (value === '' && isT3DefaultLogo(row, slot))
  }
  const raw = String(slot.jsonPath ? (atPath(column, slot) ?? '') : (column ?? ''))
  if (slot.type !== 'text') return raw.includes(String(slot.sample)) || normalText(raw).includes(sample)
  // A whole unit captured with `--inline-markup` writes its tags in the notation: its words are what the row holds.
  const words = normalText(withoutNotation(String(slot.sample ?? '')))
  // Inline markup (`<code>`, `<em>`) splits a sentence into pieces: compare with no white space at all.
  const bare = (/** @type {string} */ s) => s.replace(/\s+/g, '')
  // An attribute slot (`@alt`, `@title`) is not a text node: look in the raw column as well.
  // A whole-unit sample leaves out text inside code and svg, as capture's ContentSlots::htmlSlots does
  // (`This is a <code>.mute</code> paragraph.` is captured "This is a paragraph."), so look without them too.
  const uncoded = raw.replace(/<(code|svg)\b[\s\S]*?<\/\1>/gi, ' ')
  return (
    words === '' ||
    bare(htmlTextPieces(raw).join('')).includes(bare(words)) ||
    bare(htmlTextPieces(uncoded).join('')).includes(bare(words)) ||
    bare(normalText(raw)).includes(bare(words))
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
