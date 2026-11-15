// Every key of a row a created record writes (ticket #597): a row of a JSON list (the class `exer-features`, a
// `classes-info` row) written with only some of its keys prints PHP warnings for the others (measured, fact K1), so a
// created record carries every key its rows declare, with the declared empty value for the keys the plan does not
// fill. The keys a row declares are every location of the mapping file on that row of the record's entity: the block
// fields and the created frames (`createdFrames`). A row is an object of a JSON path whose last step is a key; a list
// of parallel arrays (the last step an index) is not a row of keys and is never filled. Pure; part of `writePlanOf`.
import { framesOf } from './draft-write-kit-build.mjs'

const list = (value) => (Array.isArray(value) ? value : [])
const isRowLoc = (loc) => list(loc?.jsonPath).length >= 2 && typeof loc.jsonPath.at(-1) === 'string'
const rowKeyOf = (entity, loc) =>
  JSON.stringify([entity, loc.column, loc.nestedJson ?? '', loc.jsonPath.slice(0, -1)])

/** Every location of a block description (fields, item fields, lists), with its entity. */
function locationsOf(node, out = []) {
  if (Array.isArray(node)) for (const n of node) locationsOf(n, out)
  else if (node && typeof node === 'object') {
    if (typeof node.entity === 'string' && typeof node.column === 'string') out.push(node)
    else for (const n of Object.values(node)) locationsOf(n, out)
  }
  return out
}

/** `{rowKey: {at, keys: Set}}` of every row the mapping declares, by entity, column and row path. */
export function declaredRowsOf(mapping) {
  const rows = new Map()
  const add = (entity, loc) => {
    if (!isRowLoc(loc)) return
    const key = rowKeyOf(entity, loc)
    const row = rows.get(key) ?? { at: loc, keys: new Set() }
    row.keys.add(loc.jsonPath.at(-1))
    rows.set(key, row)
  }
  for (const loc of locationsOf(mapping?.blocks ?? {})) add(loc.entity, loc)
  for (const frame of list(mapping?.createdFrames))
    for (const entity of list(frame.entities)) add(entity, frame)
  return rows
}

/** The empty value a key takes: the one the record's base declares at that path, else an empty text. */
function emptyOf(base, loc) {
  let node = base?.[loc.column]
  for (const step of loc.jsonPath) node = node && typeof node === 'object' ? node[step] : undefined
  return node === undefined || (node && typeof node === 'object') ? '' : node
}

/**
 * The keys of the rows a created record writes that its values leave unset: `[{loc, value}]`, each set before the
 * values (a value the plan gives wins).
 * @param {Map} rows `declaredRowsOf(mapping)`
 * @param {object} record a created record of the sink
 */
export function rowFillsOf(rows, record) {
  const written = new Set()
  const touched = new Map()
  for (const { loc } of record.values.values()) {
    if (!isRowLoc(loc)) continue
    const key = rowKeyOf(loc.entity, loc)
    written.add(`${key}|${loc.jsonPath.at(-1)}`)
    if (!touched.has(key)) touched.set(key, loc)
  }
  const fills = []
  for (const [key, loc] of touched) {
    const declared = rows.get(key)
    if (!declared) continue
    for (const name of declared.keys) {
      if (written.has(`${key}|${name}`)) continue
      const at = {
        entity: loc.entity,
        column: loc.column,
        ...(loc.nestedJson ? { nestedJson: loc.nestedJson } : {}),
        jsonPath: [...loc.jsonPath.slice(0, -1), name]
      }
      fills.push({ loc: at, value: emptyOf(record.base, at) })
    }
  }
  return fills
}

/** The HTML frames and the row fills of every created record (`framesOf`, `rowFillsOf`). */
export function planCreatedValues(state) {
  const rows = declaredRowsOf(state.kit.mapping)
  for (const record of state.sink.records.values()) {
    if (record.kind !== 'created') continue
    record.frames = framesOf(state, record)
    const fills = rowFillsOf(rows, record)
    if (fills.length) record.fills = fills
  }
}
