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
    const key = entry.key ?? placeKeyOf(entry.loc)
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
    // Child lists, and their own child lists at any depth (`lists.<name>.lists.<name>.fields`).
    const lists = (holder, at, name) => {
      for (const part of ['itemLists', 'lists'])
        for (const [child, l] of Object.entries(holder?.[part] ?? {})) {
          for (const [field, value] of Object.entries(l?.fields ?? {})) {
            const found = []
            walk(value, [...at, part, child, 'fields', field], found)
            for (const f of found)
              add({ owner: 'block', block, field, list: name ?? child, path: f.path, loc: f.loc })
          }
          lists(l, [...at, part, child], name ?? child)
        }
    }
    lists(d, [], null)
    list(d?.designLines).forEach((loc, i) =>
      add({ owner: 'design', block, field: 'designLines', path: ['designLines', i], loc })
    )
  }
  for (const [fact, value] of Object.entries(mapping?.facts ?? {})) {
    const found = []
    walk(value, ['facts', fact], found)
    for (const f of found) add({ owner: 'fact', field: fact, path: f.path, loc: f.loc })
  }
  // Every language override, with its slot or without one (a string the contract gives no slot, set or kept by key).
  list(mapping?.overrides?.language).forEach((o, i) => {
    if (typeof o?.key !== 'string') return
    add({
      ...(o.slot ? {} : { key: `language:${o.extension ?? ''}:${o.key}` }),
      owner: 'language',
      field: o.key,
      path: ['overrides', 'language', i],
      loc: o.slot ? { slot: o.slot } : {},
      language: o
    })
  })
  // The site settings the kit sets itself (`overrides.settings`): declared, never written by the build.
  list(mapping?.overrides?.settings).forEach((o, i) => {
    if (isLocation(o?.location))
      add({
        owner: 'setting',
        field: o.location.entity,
        path: ['overrides', 'settings', i, 'location'],
        loc: o.location,
        setting: o
      })
  })
  // The page titles, descriptions and share images every page and article carries (`seo.<record kind>.<part>`).
  for (const [kind, parts] of Object.entries(mapping?.seo ?? {})) {
    if (!parts || typeof parts !== 'object' || Array.isArray(parts)) continue
    for (const [part, value] of Object.entries(parts)) {
      const found = []
      walk(value, ['seo', kind, part], found)
      for (const f of found) add({ owner: 'seo', field: `${kind}.${part}`, path: f.path, loc: f.loc })
    }
  }
  // Values the kit says the blank site empties and the build never writes (the owner sets them).
  list(mapping?.emptiedNotWritten).forEach((loc, i) => {
    if (isLocation(loc))
      add({ owner: 'emptied', field: loc.entity, path: ['emptiedNotWritten', i], loc, emptied: loc })
  })
  // Values the build writes from what it made (a category id), not from a block field.
  for (const [id, loc] of Object.entries(mapping?.buildSets ?? {}))
    if (isLocation(loc)) add({ owner: 'build_set', field: loc.sets ?? id, path: ['buildSets', id], loc })
  for (const b of buildPlacesOf(mapping)) places.set(b.key, { ...b, also: [] })
  return places
}

/**
 * The mapping keys whose locations are no place of the universe, each with the reason. Any other location of the
 * mapping that the universe does not hold is unexplained (`uncoveredLocations`): a new kind of kit place cannot be
 * left out of the accounting without a line here.
 */
export const IGNORED_MAPPING_KEYS = Object.freeze({
  entities: 'the entity definitions the locations point at, no place of their own',
  notEmptied:
    'rows the blank site keeps as they are, with the kit reason (trashed or never placed); the demo scan reads what prints',
  hides:
    'where the write takes a row or an element out; the places it takes out are block places, and each hide with scope, from, element or order is a build place, and so is each field group hide (fields)',
  placements:
    'how each block is placed (its entity, its resets, the position a container holds); keyedRow, holds.copies and menu.items are build places, and the values a reset names are block places or build sets'
})

/** The locations of a mapping the universe does not hold and no ignored key covers: `[{path, loc}]`. */
export function uncoveredLocations(mapping, universe = universeOf(mapping)) {
  const found = []
  walkAll(mapping ?? {}, [], found)
  return found.filter((f) => !(String(f.path[0]) in IGNORED_MAPPING_KEYS) && !universe.has(placeKeyOf(f.loc)))
}

function walkAll(value, path, out) {
  if (Array.isArray(value)) return value.forEach((v, i) => walkAll(v, [...path, i], out))
  if (!value || typeof value !== 'object') return
  if (isLocation(value)) out.push({ path, loc: value })
  for (const [k, v] of Object.entries(value)) walkAll(v, [...path, k], out)
}

const PAGE_PARTS = ['menuItem', 'under', 'ownItem', 'record', 'unbuilt']
const HIDE_KEYS = ['scope', 'from', 'element', 'order']

/**
 * The places of what the build writes besides the blocks (#597, "What the build writes besides the blocks"), one per
 * declaration, `owner: 'build'`, `kind` naming the mapping key: the accent door, each part of each page type's page,
 * each entity of each created frame, a keyed row, a container's copies, a menu block's items, the featured article,
 * each hide carrying `scope`, `from`, `element` or `order`, and each field group hide (`fields`).
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
        if (part === 'under' && page.under.detailPositions)
          add('pages.under.detailPositions', ['pages', pageType, 'under', 'detailPositions'], {
            pageType,
            declared: page.under.detailPositions
          })
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
  // How each place the build writes prints (escaped, raw, mixed): one place per declaration the build must read.
  list(mapping?.escapes?.places).forEach((e, i) =>
    add('escapes.places', ['escapes', 'places', i], { match: e?.match ?? null })
  )
  for (const [block, hides] of Object.entries(mapping?.hides ?? {}))
    list(hides).forEach((h, i) => {
      const keys = HIDE_KEYS.filter((k) => typeof h?.[k] === 'string')
      if (keys.length) add('hides', ['hides', block, i], { block, keys, control: h.control ?? null })
      // A field group hide (#587): the group is taken off, or held because a field of it is written.
      if (Array.isArray(h?.fields))
        add('hides.fields', ['hides', block, i, 'fields'], { block, fields: h.fields, by: h.by ?? null })
    })
  return out
}

export const ACCOUNT = Object.freeze({
  written: 'written',
  declared: 'declared_not_written',
  skipped: 'skipped_by_writer',
  unexplained: 'unexplained'
})
