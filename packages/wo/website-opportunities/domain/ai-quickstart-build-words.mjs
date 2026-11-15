// The closed words of the build declarations of a mapping file (ticket #597), and the checks that keep the data
// beside them true: what the accent module holds and which order value each side takes (`look.accent`), where a
// created category takes its title (`pages.<type>.record.category.title`), when a container copy is kept
// (`placements.<id>.holds.copies.keptWhen`), and that the row a page type keys agrees with the block's own locations
// (`placements.<id>.keyedRow`). Pure. Called by `ai-quickstart-mapping-build.mjs`.

/** `look.accent.writtenAs.content`: the module text the brand and write steps build (`accentModule`). */
export const ACCENT_CONTENT = Object.freeze(['accent-module'])
/**
 * `look.accent.sides.values`: the value of the write order each side takes. `accent` is written on `:root` (the light
 * side, and every side when the template has no dark hook); `accentDark` on `:root` with `sides.darkHook`, and the
 * accent when the order has none.
 */
export const ACCENT_SIDE_VALUES = Object.freeze({ light: ['accent'], dark: ['accentDark'] })
/** `record.category.title.from`: the name of the first plan page of `pageType`, else `fallback`. */
export const CATEGORY_TITLE_FROM = Object.freeze(['page-name'])
export const CATEGORY_TITLE_FALLBACK = Object.freeze(['business-name'])
/** `holds.copies.keptWhen`: a container copy is kept while at least one block it holds is kept on its page. */
export const HOLDS_KEPT_WHEN = Object.freeze(['any-held-block-kept'])

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const each = (value) => (Array.isArray(value) ? value : [])
const words = (list) => list.map((w) => JSON.stringify(w)).join(' | ')

/** The accent words: the module content and the value each side takes. */
export function accentWordsProblems(accent, report) {
  if (!isObject(accent)) return
  if (isObject(accent.writtenAs) && !ACCENT_CONTENT.includes(accent.writtenAs.content))
    report('look.accent.writtenAs.content', `content is ${words(ACCENT_CONTENT)}: the module the steps build`)
  const values = accent.sides?.values
  const ok =
    isObject(values) &&
    Object.keys(values).length === 2 &&
    Object.entries(ACCENT_SIDE_VALUES).every(([side, known]) => known.includes(values[side]))
  if (!ok)
    report(
      'look.accent.sides.values',
      `values is {light: ${words(ACCENT_SIDE_VALUES.light)}, dark: ${words(ACCENT_SIDE_VALUES.dark)}}: the order value each side takes`
    )
}

/** The title of a category the build creates: `{from: "page-name", pageType, fallback: "business-name"}`. */
export function categoryTitleProblems(title, at, types, report) {
  const ok =
    isObject(title) &&
    CATEGORY_TITLE_FROM.includes(title.from) &&
    types.has(title.pageType) &&
    CATEGORY_TITLE_FALLBACK.includes(title.fallback)
  if (!ok)
    report(
      `${at}.title`,
      `title is {from: ${words(CATEGORY_TITLE_FROM)}, pageType: <a page type>, fallback: ${words(CATEGORY_TITLE_FALLBACK)}}`
    )
}

/** When a container copy is kept. */
export function keptWhenProblems(copies, at, report) {
  if (isObject(copies) && !HOLDS_KEPT_WHEN.includes(copies.keptWhen))
    report(`${at}.holds.copies.keptWhen`, `keptWhen is ${words(HOLDS_KEPT_WHEN)}`)
}

/** Every location of a block field entry (`{entity, column, ...}`, a list of them, or a derived key's `keyAt`). */
function locationsOf(entry) {
  if (Array.isArray(entry)) return entry.flatMap(locationsOf)
  if (!isObject(entry)) return []
  if (isObject(entry.keyAt)) return [entry.keyAt]
  return entry.entity && entry.column ? [entry] : []
}
/** The row index of a location: the first integer of its JSON path, or null. */
const rowOf = (loc) => each(loc.jsonPath).find((step) => Number.isInteger(step)) ?? null

/**
 * `keyedRow: {pageType, row, list, fields, why}` agrees with the mapping's own locations: every field named is a
 * block field whose locations all sit at `row`, every block field at `row` is named, the derived page key names
 * `pageType`, and no row of `list` sits at `row`.
 */
export function keyedRowProblems(id, k, mapping, report) {
  const at = `placements[${id}].keyedRow`
  const entry = mapping.blocks?.[id]
  if (!isObject(k) || !isObject(entry)) return
  const fields = isObject(entry.fields) ? entry.fields : {}
  for (const name of each(k.fields)) {
    const locs = locationsOf(fields[name])
    if (!locs.length || !locs.every((l) => rowOf(l) === k.row))
      report(`${at}.fields`, `${name} is no field of ${id} written at row ${k.row}`)
    if (fields[name]?.derived !== undefined && fields[name].pageType !== k.pageType)
      report(`${at}.pageType`, `${name} keys the row to ${fields[name].pageType}, not ${k.pageType}`)
  }
  for (const [name, value] of Object.entries(fields))
    if (locationsOf(value).some((l) => rowOf(l) === k.row) && !each(k.fields).includes(name))
      report(`${at}.fields`, `${name} is written at row ${k.row} and is not named`)
  const rows = locationsOf(Object.values(entry.lists?.[k.list]?.fields ?? {}))
  if (!rows.length) report(`${at}.list`, `${k.list} is no list of ${id}`)
  else if (rows.some((l) => rowOf(l) === k.row))
    report(`${at}.row`, `a row of the list ${k.list} sits at row ${k.row}`)
}
