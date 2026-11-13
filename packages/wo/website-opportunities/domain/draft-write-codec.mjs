// Reading and setting a value at a mapping location of a record (ticket #597), the way Joomla stores it: a column, a JSON
// path inside the column (`params`, `attribs`, `images`), a JSON string nested at a key of it (a JA ACM block's
// `jatools-config`, written back in the form PHP's `json_encode` writes), and an xpath piece of a stored HTML value.
// Pure. The xpath pieces go through `html` (`{get(html, xpath), set(html, xpath, value), remove(html, xpath)}`): the real
// door client passes the plugin's own functions (`scripts/ai-quickstart/html-piece.php`, as `copy-proof-lib.mjs` does),
// the memory site its own. The row cut and the row move after it follow `copy-proof-lib.mjs` (`cutRows`,
// `movedAfterCut`), byte for byte in what they keep.

const parse = (value) => {
  if (value && typeof value === 'object') return structuredClone(value)
  return typeof value === 'string' && value.trim() !== '' ? JSON.parse(value) : {}
}
// PHP's json_encode form, as Joomla stores a nested JSON value: slashes escaped.
const encode = (value) => JSON.stringify(value).replace(/\//g, '\\/')

/** A stable key of a location on its record: column, nested key, JSON path and xpath. */
export const addressOf = (loc) =>
  [loc.column, loc.nestedJson ?? '', (loc.jsonPath ?? []).join('/'), loc.xpath ?? ''].join('|')

/** Whether a location stores a text node, which a door never takes empty (one space keeps the node). */
export const isTextNode = (loc) => /text\(\)(\[\d+\])?$/.test(loc?.xpath ?? '')

function inner(fields, loc) {
  const outer = parse(fields[loc.column])
  return { outer, data: loc.nestedJson ? parse(outer[loc.nestedJson]) : outer }
}
function store(fields, loc, outer, data) {
  if (loc.nestedJson) outer[loc.nestedJson] = encode(data)
  return { ...fields, [loc.column]: JSON.stringify(outer) }
}

/** The fields of a record with `value` set at `loc`. A JSON path missing on the record is made (objects, lists). */
export function setAt(fields, loc, value, html) {
  const piece = (stored) => (loc.xpath ? html.set(String(stored ?? ''), loc.xpath, value) : value)
  if (!loc.jsonPath?.length && !loc.nestedJson) return { ...fields, [loc.column]: piece(fields[loc.column]) }
  const { outer, data } = inner(fields, loc)
  const steps = loc.jsonPath ?? []
  let node = data
  steps.slice(0, -1).forEach((step, i) => {
    if (node[step] === undefined || node[step] === null) node[step] = Number.isInteger(steps[i + 1]) ? [] : {}
    node = node[step]
  })
  const last = steps.at(-1)
  node[last] = piece(node[last])
  return store(fields, loc, outer, data)
}

/** The value a record holds at `loc` (a piece: the text the piece holds). */
export function getAt(fields, loc, html) {
  let value = fields[loc.column]
  if (loc.jsonPath?.length || loc.nestedJson) {
    let node = inner(fields, loc).data
    for (const step of loc.jsonPath ?? []) node = node?.[step]
    value = node
  }
  return loc.xpath ? html.get(String(value ?? ''), loc.xpath) : value
}

/** The fields with the element `xpath` names taken out of the HTML value at `loc` (a `rows.remove` on a copy). */
export function removeAt(fields, loc, xpath, html) {
  const at = { ...loc, xpath: undefined }
  const stored = String(getAt(fields, at, html) ?? '')
  return setAt(fields, at, html.remove(stored, xpath), html)
}

/**
 * Cut the rows of a `row` hide, keeping the row indexes `kept` in their order. `arrays`: parallel lists read across by
 * index; `keys`: one row per named key of the parent object (not measured on a real site: `unproven`).
 */
export function cutRows(fields, row, kept) {
  const { outer, data } = inner(fields, row)
  let node = data
  for (const step of row.parent) node = node?.[step]
  if (!node) return fields
  for (const key of row.arrays ?? [])
    if (Array.isArray(node[key]))
      node[key] = kept.filter((i) => i < node[key].length).map((i) => node[key][i])
  if (row.keys)
    row.keys.forEach((name, i) => {
      if (!kept.includes(i)) delete node[name]
    })
  return store(fields, row, outer, data)
}

/** Where a location of a row reads after a cut kept `kept`; null when its row was cut, unchanged outside the rows. */
export function movedAfterCut(loc, row, kept) {
  const path = loc.jsonPath ?? []
  const depth = row.parent.length
  const inRows =
    loc.column === row.column &&
    (loc.nestedJson ?? null) === (row.nestedJson ?? null) &&
    row.parent.every((step, i) => path[i] === step) &&
    (row.arrays ?? []).includes(path[depth]) &&
    Number.isInteger(path[depth + 1])
  if (!inRows) return loc
  const at = kept.indexOf(path[depth + 1])
  if (at < 0) return null
  return { ...loc, jsonPath: [...path.slice(0, depth + 1), at, ...path.slice(depth + 2)] }
}

/** The row index a location names in a `row` hide, or null when it is outside the rows. */
export function rowIndexOf(loc, row) {
  const path = loc.jsonPath ?? []
  const depth = row.parent.length
  const inRows =
    loc.column === row.column &&
    (loc.nestedJson ?? null) === (row.nestedJson ?? null) &&
    row.parent.every((step, i) => path[i] === step) &&
    (row.arrays ?? []).includes(path[depth]) &&
    Number.isInteger(path[depth + 1])
  return inRows ? path[depth + 1] : null
}
