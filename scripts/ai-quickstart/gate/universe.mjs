// The universe of the marker test and its accounting (ticket #585, ADR 0045 decision 3). The universe is every place
// an AI quickstart's mapping file declares: each location of each block field, item field, child list field and design
// line, each place of each business fact, and each language string the mapping classes. The marker build accounts for
// every one of them, once:
//   written               a write plan operation writes it, or removes the element it sits in (a row taken out)
//   declared_not_written  the kit itself says the build never writes it: a design line, a language string kept or set
//                         by the kit, a setting the kit overrides
//   skipped_by_writer     the build team's chain leaves it, with the reason it gives: the rules gate did not place its
//                         block, the write order or the write plan skipped it, or a write step gap took its block out
//   unexplained           none of these: a failure of the gate, which must be zero
// Pure: the mapping and the step values in, counts and the place list out. Takes the template as input: no name of a
// template is read here.

const list = (value) => (Array.isArray(value) ? value : [])
const isLocation = (v) =>
  v && typeof v === 'object' && (typeof v.slot === 'string' || typeof v.entity === 'string')

/** The address of a location: the same place reads the same however the mapping nests it. */
export function placeKeyOf(loc) {
  const at = loc.slot ? `slot:${loc.slot}` : `entity:${loc.entity}.${loc.column ?? ''}`
  return [at, list(loc.jsonPath).join('/'), loc.xpath ?? ''].join('|')
}

function walk(value, path, out) {
  if (isLocation(value)) return out.push({ path, loc: value })
  if (Array.isArray(value)) return value.forEach((v, i) => walk(v, [...path, i], out))
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) walk(v, [...path, k], out)
}

/**
 * Every place of a mapping, by place key: `{key, loc, owner: 'block' | 'fact' | 'language' | 'design', block?, field,
 * path}` (`field`: the field, item field or child list field name; `path`: where in the mapping it sits).
 */
export function universeOf(mapping) {
  const places = new Map()
  const add = (entry) => {
    const key = placeKeyOf(entry.loc)
    const had = places.get(key)
    if (had) had.also.push(entry.block ?? entry.field)
    else places.set(key, { key, ...entry, also: [] })
  }
  for (const [block, d] of Object.entries(mapping?.blocks ?? {})) {
    for (const part of ['fields', 'itemFields'])
      for (const [field, value] of Object.entries(d?.[part] ?? {})) {
        const found = []
        walk(value, [part, field], found)
        for (const f of found) add({ owner: 'block', block, field, path: f.path, loc: f.loc })
      }
    for (const part of ['itemLists', 'lists'])
      for (const [name, l] of Object.entries(d?.[part] ?? {}))
        for (const [field, value] of Object.entries(l?.fields ?? {})) {
          const found = []
          walk(value, [part, name, field], found)
          for (const f of found) add({ owner: 'block', block, field, list: name, path: f.path, loc: f.loc })
        }
    list(d?.designLines).forEach((loc, i) =>
      add({ owner: 'design', block, field: 'designLines', path: ['designLines', i], loc })
    )
  }
  for (const [fact, value] of Object.entries(mapping?.facts ?? {})) {
    const found = []
    walk(value, ['facts', fact], found)
    for (const f of found) add({ owner: 'fact', field: fact, path: f.path, loc: f.loc })
  }
  list(mapping?.overrides?.language).forEach((o, i) => {
    if (o?.slot)
      add({
        owner: 'language',
        field: o.key,
        path: ['overrides', 'language', i],
        loc: { slot: o.slot },
        language: o
      })
  })
  return places
}

export const ACCOUNT = Object.freeze({
  written: 'written',
  declared: 'declared_not_written',
  skipped: 'skipped_by_writer',
  unexplained: 'unexplained'
})
