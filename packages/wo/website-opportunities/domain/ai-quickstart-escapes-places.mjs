// Every place a build writes, as the mapping file declares it, in the form the `escapes` declaration matches
// (`ai-quickstart-escapes.mjs`). Pure.
//
// A place is `{kind, column, nestedJson?, key?, block?, menutype?}`:
//   kind       the record kind (`entities[<entity>].kind`; an SEO place on `page` takes the kind of its SEO record,
//              `menuItem` or `article`, and the single SEO form `page`);
//   key        the last name of the JSON path (`features-intro[info-phone]`, `og_title`), or the identity key of a
//              language string or a template site setting (`TPL_TRY_CLASS`, `site_logo`);
//   block      the store block whose record the place is on (the `entity` of its `placements` entry), or
//              `look.accent` for the accent module;
//   menutype   the menu of a menu item.
// What it reads (a location marked `notWritten` left out): every location of `blocks` (fields, item fields, child lists; never a design line), `facts`,
// `seo`, `overrides` (settings, and each language string written with `value` or `filledBy`), `buildSets`, the
// `resets` and `holds.position` of `placements`, every `setting` hide, the accent module (`look.accent.writtenAs`),
// each page's menu item title (`pages.<type>.menuItem`, `ownItem`) and each created category's title
// (`pages.<type>.record.category`). A record base (`pages.<type>.record.base`), a page's menu item params and a
// created frame are fixed values of the kit, not words, so they are no place here.

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const each = (value) => (Array.isArray(value) ? value : [])
const isLocation = (value) =>
  isObject(value) && typeof value.entity === 'string' && typeof value.column === 'string'

/** Every location under a value of a block entry (fields, item fields, child lists), at its path. */
function locationsUnder(value, at, out) {
  if (Array.isArray(value)) value.forEach((v, i) => locationsUnder(v, `${at}[${i}]`, out))
  else if (isLocation(value)) out.push({ at, loc: value })
  else if (isObject(value) && !Object.hasOwn(value, 'fact'))
    for (const [k, v] of Object.entries(value)) locationsUnder(v, `${at}.${k}`, out)
}

/** The main menu: the menutype of the layout drawn menu (the header), where the build puts the page items. */
const mainMenuOf = (mapping) =>
  Object.values(mapping.placements ?? {}).find((p) => p?.layout && p?.menu?.menutype)?.menu?.menutype ?? null

/** The place a location is, read through the mapping's entities and placements. */
export function placeOf(mapping, loc, pageKind = 'page') {
  const entity = loc.entity === 'page' ? { kind: pageKind } : (mapping.entities?.[loc.entity] ?? {})
  const names = each(loc.jsonPath).filter((step) => typeof step === 'string')
  const key = names.at(-1) ?? entity.identity?.key
  const block = Object.entries(mapping.placements ?? {}).find(([, p]) => p?.entity === loc.entity)?.[0]
  const menutype = entity.kind === 'menuItem' ? entity.identity?.menutype : undefined
  return {
    kind: entity.kind ?? null,
    column: loc.column,
    ...(loc.nestedJson ? { nestedJson: loc.nestedJson } : {}),
    ...(key ? { key } : {}),
    ...(block ? { block } : {}),
    ...(menutype ? { menutype } : {})
  }
}

function seoPlaces(mapping, push) {
  const seo = mapping.seo ?? {}
  for (const name of ['title', 'description', 'shareImage'])
    if (isLocation(seo[name])) push(`seo.${name}`, seo[name], 'page')
  for (const record of ['menuItem', 'article']) {
    const r = seo[record]
    if (!isObject(r)) continue
    for (const name of ['title', 'description', 'shareImage'])
      each(r[name]).forEach((loc, i) => isLocation(loc) && push(`seo.${record}.${name}[${i}]`, loc, record))
    each(r.ogTitle?.locations).forEach((loc, i) => push(`seo.${record}.ogTitle.locations[${i}]`, loc, record))
  }
}

/** Every place the build writes: `[{at, place}]`, `at` naming where the mapping file declares it. */
export function writtenPlacesOf(mapping) {
  const out = []
  // A location the mapping declares `notWritten` (by decision) is no place the build writes.
  const push = (at, loc, pageKind) =>
    !loc.notWritten && out.push({ at, place: placeOf(mapping, loc, pageKind) })
  for (const [id, entry] of Object.entries(mapping.blocks ?? {})) {
    const found = []
    for (const key of ['fields', 'itemFields', 'lists', 'itemLists'])
      if (entry?.[key] !== undefined) locationsUnder(entry[key], `blocks[${id}].${key}`, found)
    for (const { at, loc } of found) push(at, loc)
  }
  for (const [name, list] of Object.entries(mapping.facts ?? {}))
    each(list).forEach((loc, i) => isLocation(loc) && push(`facts.${name}[${i}]`, loc))
  seoPlaces(mapping, push)
  each(mapping.overrides?.settings).forEach(
    (o, i) => isLocation(o?.location) && push(`overrides.settings[${i}].location`, o.location)
  )
  each(mapping.overrides?.language).forEach((o, i) => {
    if (o?.value === undefined && o?.filledBy === undefined) return
    out.push({
      at: `overrides.language[${i}]`,
      place: { kind: 'languageString', column: 'value', key: o.key }
    })
  })
  for (const [ref, loc] of Object.entries(mapping.buildSets ?? {}))
    if (isLocation(loc)) push(`buildSets[${ref}]`, loc)
  for (const [id, p] of Object.entries(mapping.placements ?? {})) {
    each(p?.resets).forEach(
      (r, i) => isLocation(r?.location) && push(`placements.${id}.resets[${i}].location`, r.location)
    )
    if (isLocation(p?.holds?.position)) push(`placements.${id}.holds.position`, p.holds.position)
  }
  for (const [id, list] of Object.entries(mapping.hides ?? {}))
    each(list).forEach(
      (h, i) =>
        h?.by === 'setting' && isLocation(h.location) && push(`hides.${id}[${i}].location`, h.location)
    )
  const accent = mapping.look?.accent?.writtenAs
  if (isObject(accent))
    for (const column of ['title', 'content'])
      out.push({
        at: `look.accent.writtenAs.${column}`,
        place: { kind: 'module', column, block: 'look.accent' }
      })
  const menutype = mainMenuOf(mapping)
  for (const [type, page] of Object.entries(mapping.pages ?? {})) {
    for (const item of ['menuItem', 'ownItem'])
      if (isObject(page?.[item]))
        out.push({
          at: `pages.${type}.${item}.title`,
          place: { kind: 'menuItem', column: 'title', ...(menutype ? { menutype } : {}) }
        })
    if (isObject(page?.record?.category))
      out.push({ at: `pages.${type}.record.category.title`, place: { kind: 'category', column: 'title' } })
  }
  return out
}
