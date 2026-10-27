/**
 * The search and Categories filter over the Design system tab's library (Akemi, 12/10/2026: "the same bar as the
 * Design inspiration gallery"). Pure, so `node --test` runs it without a build. The bar itself is
 * `DesignSystemFilter.tsx`; the Add site sheet carries a port of this file (`tracy-add-site`
 * `design-system-filter.mjs`), since a plugin never imports another plugin's internals.
 *
 * - A category is the Refero catalogue's `industry`. The library door sends it as the row's `group`, capitalised
 *   (`ds-slot.js` `referoLibrary`: "Saas", "Devtools", "Other" for a row with none), so the key is the group
 *   lower-cased. A group this list does not know falls under Other: a category with no display name is never drawn.
 * - The filter is one object, `{ query, categories }`. A second axis (the catalogue's `theme`: light, dark, mixed)
 *   would be one more set beside `categories`, ANDed the same way; it is not built yet.
 * - Search is by NAME, as the gallery's is (`Filter.tsx` `select`): substring, case-folded. Ticked categories are
 *   ORed among themselves and ANDed with the search, as the gallery's ticks are.
 */

/** Every industry the catalogue uses, in the order a tie in count keeps. Other is always last. */
export const INDUSTRIES = /** @type {const} */ ([
  'saas',
  'agency',
  'ecommerce',
  'ai',
  'design',
  'devtools',
  'fintech',
  'productivity',
  'media',
  'crypto',
  'other'
])

/**
 * The looks the Theme menu offers, in its order: the Refero catalogue's `theme`, which every system has (light,
 * dark or mixed), passed on by the library door (Akemi, 12/10/2026).
 */
export const THEMES = /** @type {const} */ (['light', 'dark', 'mixed'])

/**
 * @typedef {{ query: string, categories: ReadonlySet<string>, themes?: ReadonlySet<string> }} SystemFilter
 */

/** No search, nothing ticked: every row. */
export const NO_FILTER = /** @type {SystemFilter} */ ({ query: '', categories: new Set(), themes: new Set() })

/**
 * The industry key of a library row, from the `group` the door sends.
 * @param {{ group?: string | null }} row
 * @returns {string}
 */
export function industryOf(row) {
  const key = typeof row?.group === 'string' ? row.group.trim().toLowerCase() : ''
  return /** @type {readonly string[]} */ (INDUSTRIES).includes(key) ? key : 'other'
}

/**
 * The Categories list: the industries present in `rows`, each with how many rows it holds, most first, ties in
 * `INDUSTRIES` order, Other last whatever its count. Counted over every row offered, not what the search leaves,
 * like the gallery's counts.
 * @param {{ group?: string | null }[]} rows
 * @returns {{ key: string, count: number }[]}
 */
export function categoriesOf(rows) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const row of rows) {
    const key = industryOf(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const order = (/** @type {string} */ k) => /** @type {readonly string[]} */ (INDUSTRIES).indexOf(k)
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => {
      if (a.key === 'other' || b.key === 'other') return a.key === 'other' ? 1 : -1
      return b.count - a.count || order(a.key) - order(b.key)
    })
}

/**
 * The theme key of a library row, from the `theme` the door sends; null when the row has none (an older server).
 * @param {{ theme?: string | null }} row
 * @returns {string | null}
 */
export function themeOf(row) {
  const key = typeof row?.theme === 'string' ? row.theme.trim().toLowerCase() : ''
  return /** @type {readonly string[]} */ (THEMES).includes(key) ? key : null
}

/**
 * The Theme list: Light, Dark, Mixed in that order, each with how many rows it holds, over every row offered (like
 * the Categories counts). A theme no row has is not listed; rows without a theme (an older server) list nothing.
 * @param {{ theme?: string | null }[]} rows
 * @returns {{ key: string, count: number }[]}
 */
export function themesOf(rows) {
  /** @type {Map<string, number>} */
  const counts = new Map()
  for (const row of rows) {
    const key = themeOf(row)
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return THEMES.filter((k) => counts.has(k)).map((key) => ({ key, count: counts.get(key) ?? 0 }))
}

/**
 * The rows a filter lets through, in their own order. Ticked themes are ORed among themselves and ANDed with the
 * categories and the search.
 * @template {{ name: string, group?: string | null, theme?: string | null }} R
 * @param {R[]} rows
 * @param {SystemFilter} filter
 * @returns {R[]}
 */
export function filterSystems(rows, filter) {
  const q = filter.query.trim().toLowerCase()
  const ticked = filter.categories
  const looks = filter.themes ?? new Set()
  return rows.filter(
    (row) =>
      (q === '' || row.name.toLowerCase().includes(q)) &&
      (ticked.size === 0 || ticked.has(industryOf(row))) &&
      (looks.size === 0 || looks.has(themeOf(row) ?? ''))
  )
}

/** Whether anything narrows the list (the bar then offers Clear). */
export function isFiltered(/** @type {SystemFilter} */ filter) {
  return filter.query !== '' || filter.categories.size > 0 || (filter.themes?.size ?? 0) > 0
}

/**
 * The line under the bar, the gallery's pattern: all, or a part of the whole.
 * @param {number} shown
 * @param {number} total
 * @returns {{ key: 'ds.filter.countAll' | 'ds.filter.count', params: Record<string, number> }}
 */
export function countLineOf(shown, total) {
  return shown === total
    ? { key: 'ds.filter.countAll', params: { total } }
    : { key: 'ds.filter.count', params: { shown, total } }
}
