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
  for (const b of buildPlacesOf(mapping)) places.set(b.key, { ...b, also: [] })
  return places
}

const PAGE_PARTS = ['menuItem', 'under', 'ownItem', 'record', 'unbuilt']
const HIDE_KEYS = ['scope', 'from', 'element', 'order']

/**
 * The places of what the build writes besides the blocks (#597, "What the build writes besides the blocks"), one per
 * declaration, `owner: 'build'`, `kind` naming the mapping key: the accent door, each part of each page type's page,
 * each entity of each created frame, a keyed row, a container's copies, a menu block's items, the featured article,
 * and each hide carrying `scope`, `from`, `element` or `order`.
 */
export function buildPlacesOf(mapping) {
  const out = []
  const add = (kind, path, extra = {}) =>
    out.push({ key: `build:${path.join('.')}`, owner: 'build', kind, field: kind, path, loc: {}, ...extra })
  if (mapping?.look?.accent) add('look.accent', ['look', 'accent'])
  for (const [pageType, page] of Object.entries(mapping?.pages ?? {}))
    for (const part of PAGE_PARTS)
      if (page?.[part]) {
        add(`pages.${part}`, ['pages', pageType, part], { pageType, declared: page[part] })
        if (part === 'record' && page.record.category)
          add('pages.record.category', ['pages', pageType, 'record', 'category'], { pageType })
      }
  list(mapping?.createdFrames).forEach((f, i) => {
    for (const entity of list(f?.entities))
      add('createdFrames', ['createdFrames', i, entity], {
        entity,
        recordKind: mapping.entities?.[entity]?.kind ?? null
      })
  })
  for (const [id, p] of Object.entries(mapping?.placements ?? {})) {
    if (p?.keyedRow) add('placements.keyedRow', ['placements', id, 'keyedRow'], { block: id })
    if (p?.holds?.copies) add('placements.holds.copies', ['placements', id, 'holds', 'copies'], { block: id })
    if (p?.menu?.items) add('placements.menu.items', ['placements', id, 'menu', 'items'], { block: id })
  }
  if (mapping?.seo?.featuredView?.article) add('seo.featuredView.article', ['seo', 'featuredView', 'article'])
  for (const [block, hides] of Object.entries(mapping?.hides ?? {}))
    list(hides).forEach((h, i) => {
      const keys = HIDE_KEYS.filter((k) => typeof h?.[k] === 'string')
      if (keys.length) add('hides', ['hides', block, i], { block, keys, control: h.control ?? null })
    })
  return out
}

export const ACCOUNT = Object.freeze({
  written: 'written',
  declared: 'declared_not_written',
  skipped: 'skipped_by_writer',
  unexplained: 'unexplained'
})
