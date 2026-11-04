// The stylesheets the brand is measured on: those the template serves in the colour theme a visitor opens on. A
// template can show its other colour themes off on pages of their own (a T3 template style per theme, each with its
// own compiled stylesheets: JA Diner's "Home - Red", "Home - Blue"). Those sheets declare the same role rules in
// other colours, and the last one read would win the measure, so a sheet only such pages serve is left out.
import { pathOfRoute } from '../kit-paths.mjs'

/**
 * The paths of the map pages that render on one of `styleKeys` (the adapter's `themeVariantStyles()`).
 * @param {{pages?: Array<{route: string, style?: string|null}>}} map
 * @param {string[]} styleKeys
 * @returns {Set<string>}
 */
export function pathsOnStyles(map, styleKeys) {
  const keys = new Set(styleKeys)
  return new Set(
    (map.pages ?? []).filter((p) => p.style && keys.has(p.style)).map((p) => pathOfRoute(p.route))
  )
}

/**
 * The stylesheets at least one page outside `variantPaths` serves. A sheet that does not say which pages serve it
 * is kept. With no variant page every sheet is kept, as it was.
 * @template {{pages?: string[]}} S
 * @param {S[]} styles
 * @param {Set<string>} variantPaths
 * @returns {S[]}
 */
export function stylesOfOpeningTheme(styles, variantPaths) {
  if (!variantPaths.size) return styles
  return styles.filter((s) => !s.pages?.length || s.pages.some((p) => !variantPaths.has(p)))
}
