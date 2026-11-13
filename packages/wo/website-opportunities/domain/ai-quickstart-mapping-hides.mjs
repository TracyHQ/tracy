// The hide declarations of an AI quickstart mapping file (ticket #584). Pure. Called by `mappingPlaceProblems`
// (`ai-quickstart-mapping-places.mjs`) with the block store.
//
// A field the build leaves empty must not leave visible damage on a record the blank site keeps: a button with no
// words still prints its box and arrow, a list row with nothing in it still prints its card or its empty circle. So
// every such place says how it leaves the page, in `hides: {"<block id>": [entry]}`, one entry per control or rows:
//   - `{"control": ["<label field>", "<link field>"], "by", "why"}`: a button of the block (`fields`) or of each item
//     (`itemFields`): a link field with a label field (kind `*.button_label` or `*.cta_label`) in the same scope;
//   - `{"rows": "items" | "<list name>", "by", "why"}`: the items of a block, or the rows of one of its lists, when
//     the store lets their count be lower than the places the template holds (`items.min < items.max`).
// `by` is how the build takes it off the page, one of `HIDE_WAYS`:
//   - `empty`: the build writes "" into every location of the named fields, label and address together; the template
//     prints the control only when they hold words;
//   - `rows.remove`: the build names `slots` (content map keys) in one `rows.remove` of the plugin, which takes their
//     element out of the stored HTML value; every location of the named fields is one of them and has an xpath;
//   - `setting`: the build writes `value` at `location` (a record setting no content map slot holds) with
//     `content.get` and `content.update`;
//   - `omit`: the rows are pieces of one stored value; the build leaves a row it does not fill out of the value it
//     writes (every location of the list's fields is a piece);
//   - `row`: the rows are reviewed rows of the template's stored lists (`row: {entity, column, nestedJson?, parent,
//     arrays | keys}`, the shape of the plugin's reviewed rows, or a list of them): parallel lists read across by
//     index, or one row per key; the build names every slot of a row it does not fill in one `rows.remove`. Every
//     location of the named fields lies in one of them.
// Only places on a record the blank site keeps need an entry: the build writes a created record with what it has.
import { locationProblem } from './ai-quickstart-mapping-entry.mjs'

/** The ways a build takes an empty control or row off the page. */
export const HIDE_WAYS = Object.freeze(['empty', 'rows.remove', 'setting', 'omit', 'row'])

const LABEL_KIND = /\.(?:button|cta)_label$/
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isName = (value) => typeof value === 'string' && value.trim() !== ''
const each = (value) => (Array.isArray(value) ? value : [])
// A derived link (`{derived}`) is no stored place: only a location with an entity counts.
const flat = (value) =>
  (Array.isArray(value) ? value.flat(4) : value ? [value] : []).filter((l) => isObject(l) && isName(l.entity))

/** The locations of a field of a mapping scope (`fields`, `itemFields`, or a list's `fields`). */
const locationsOf = (scope, name) => flat(scope?.[name])

/** The stored entries of a block: its scopes of fields, each with the store's field list beside the mapping's. */
function scopesOfBlock(block, entry) {
  const out = [
    { key: 'fields', fields: each(block.fields), places: entry?.fields },
    { key: 'itemFields', fields: each(block.itemFields), places: entry?.itemFields }
  ]
  return out
}

/** The lists of a block, from the store and the mapping: `[{name, list, places}]`. */
function listsOfBlock(block, entry) {
  const out = []
  for (const key of ['lists', 'itemLists'])
    for (const list of each(block[key]))
      out.push({ name: list.name, list, places: entry?.[key]?.[list.name]?.fields })
  return out
}

const keptIn = (locations, created) => locations.some((l) => !created.has(l.entity))
const fewerAllowed = (items) =>
  Number.isInteger(items?.min) && Number.isInteger(items?.max) && items.min < items.max

/** What must be declared for one block: the controls (label and link names) and the rows it can have fewer of. */
export function hidesNeeded(block, entry, created) {
  const controls = []
  for (const scope of scopesOfBlock(block, entry)) {
    const kept = (f) => keptIn(locationsOf(scope.places, f.name), created)
    const links = scope.fields.filter((f) => f.type === 'link' && !f.derived && kept(f))
    // A label kept in a template language string is the template's own words for every card (the overrides write
    // it), not a button of this record.
    const ownLabel = (f) =>
      locationsOf(scope.places, f.name).some((l) => !String(l.entity).startsWith('languageString-'))
    const labels = scope.fields.filter(
      (f) => f.type === 'text' && LABEL_KIND.test(String(f.kind)) && kept(f) && ownLabel(f)
    )
    if (links.length && labels.length)
      for (const f of [...labels, ...links]) controls.push({ scope: scope.key, name: f.name })
  }
  const rows = []
  if (fewerAllowed(block.items)) {
    const places = Object.keys(entry?.itemFields ?? {}).flatMap((n) => locationsOf(entry.itemFields, n))
    if (places.length && keptIn(places, created)) rows.push('items')
  }
  for (const { name, list, places } of listsOfBlock(block, entry)) {
    const locations = Object.keys(places ?? {}).flatMap((n) => locationsOf(places, n))
    if (fewerAllowed(list.items) && locations.length && keptIn(locations, created)) rows.push(name)
  }
  return { controls, rows }
}

/** The locations an entry's fields or rows hold. */
function entryLocations(entry, block, mapped) {
  if (Array.isArray(entry.control)) {
    const scopes = scopesOfBlock(block, mapped)
    return entry.control.flatMap((name) => scopes.flatMap((s) => locationsOf(s.places, name)))
  }
  if (entry.rows === 'items')
    return Object.keys(mapped?.itemFields ?? {}).flatMap((n) => locationsOf(mapped.itemFields, n))
  const list = listsOfBlock(block, mapped).find((l) => l.name === entry.rows)
  return Object.keys(list?.places ?? {}).flatMap((n) => locationsOf(list.places, n))
}

const startsWith = (path, parent) => parent.every((step, i) => path[i] === step)

/** What is wrong with the way one entry takes its places off the page. */
function wayProblems(entry, locations, at, report) {
  const { by } = entry
  if (by === 'rows.remove') {
    const slots = each(entry.slots)
    if (!slots.length || !slots.every(isName))
      return report(`${at}.slots`, 'rows.remove names the content map slots of the element it takes out')
    for (const l of locations) {
      if (!isName(l.xpath))
        report(
          at,
          `${l.slot ?? l.entity}: rows.remove takes an element of an HTML value, and this place has no xpath`
        )
      else if (!slots.includes(l.slot))
        report(`${at}.slots`, `${l.slot}: a place of the control the slots leave out`)
    }
  } else if (by === 'setting') {
    const problem = locationProblem(entry.location)
    if (problem) report(`${at}.location`, problem)
    if (typeof entry.value !== 'string') report(`${at}.value`, 'the value written at the setting, a string')
  } else if (by === 'omit') {
    if (!entry.rows) report(at, 'omit hides rows: name them with "rows"')
    for (const l of locations)
      if (l.piece !== true)
        report(
          at,
          `${l.slot ?? l.entity}: omit leaves a row out of one stored value; this place is no piece of one`
        )
  } else if (by === 'row') {
    if (!entry.rows) report(at, 'row hides rows: name them with "rows"')
    const rows = Array.isArray(entry.row) ? entry.row : [entry.row]
    if (!rows.length || !rows.every(rowShapeOk))
      return report(
        `${at}.row`,
        'a row is {entity, column, nestedJson?, parent, arrays | keys}, as the plugin reviews rows (or a list of them)'
      )
    for (const l of locations)
      if (!rows.some((row) => inRow(l, row)))
        report(`${at}.row`, `${l.slot ?? l.entity}: this place lies in none of the row's lists`)
  }
}

/** A reviewed row's shape: parallel lists read across by index (`arrays`), or one row per key (`keys`). */
function rowShapeOk(row) {
  if (!isObject(row) || !isName(row.entity) || !isName(row.column) || !Array.isArray(row.parent)) return false
  const names = row.arrays ?? row.keys
  return (
    (row.arrays === undefined) !== (row.keys === undefined) && each(names).length > 0 && names.every(isName)
  )
}

/** Whether a location lies in a row: in one of its lists at an index, or under one of its keys. */
function inRow(l, row) {
  const path = each(l.jsonPath)
  const step = path[row.parent.length]
  const same =
    l.entity === row.entity &&
    l.column === row.column &&
    (l.nestedJson ?? null) === (row.nestedJson ?? null) &&
    startsWith(path, row.parent)
  if (!same) return false
  if (row.keys) return row.keys.includes(String(step))
  return row.arrays.includes(step) && Number.isInteger(path[row.parent.length + 1])
}

/** Every problem of `mapping.hides` against the block store. */
export function hideProblems(mapping, blockStore, report) {
  const hides = mapping?.hides
  if (hides !== undefined && !isObject(hides))
    return report('hides', 'hides maps a block id to its hide entries')
  const created = new Set(
    Object.entries(isObject(mapping?.entities) ? mapping.entities : {})
      .filter(([, e]) => e?.created === true)
      .map(([key]) => key)
  )
  const blocks = new Map(each(blockStore?.blocks).map((b) => [b?.id, b]))
  for (const id of Object.keys(hides ?? {}))
    if (!blocks.has(id)) report(`hides[${id}]`, `"${id}" is not a block of the store`)
  for (const block of blocks.values()) {
    const mapped = mapping?.blocks?.[block.id]
    const entries = each(hides?.[block.id])
    const at = (i) => `hides[${block.id}][${i}]`
    const named = { controls: new Set(), rows: new Set() }
    entries.forEach((entry, i) => {
      if (!isObject(entry)) return report(at(i), 'a hide entry is {control | rows, by, why}')
      if (Array.isArray(entry.control) === Boolean(entry.rows))
        return report(
          at(i),
          'a hide entry names either a control (its fields) or rows ("items" or a list name)'
        )
      if (!HIDE_WAYS.includes(entry.by)) report(`${at(i)}.by`, `by must be one of ${HIDE_WAYS.join(', ')}`)
      if (!isName(entry.why))
        report(`${at(i)}.why`, 'say why this way takes the place off the page (measured how)')
      if (Array.isArray(entry.control)) for (const name of entry.control) named.controls.add(name)
      else named.rows.add(entry.rows)
      wayProblems(entry, entryLocations(entry, block, mapped), at(i), report)
    })
    const needed = hidesNeeded(block, mapped, created)
    for (const { scope, name } of needed.controls)
      if (!named.controls.has(name))
        report(
          `hides[${block.id}]`,
          `${scope}.${name} is part of a button: say how an empty button leaves the page (a "control" entry)`
        )
    for (const rows of needed.rows)
      if (!named.rows.has(rows))
        report(
          `hides[${block.id}]`,
          `${rows === 'items' ? 'its items' : `list ${rows}`} can hold fewer rows than the template: say how an unfilled row leaves the page (a "rows" entry)`
        )
  }
}
