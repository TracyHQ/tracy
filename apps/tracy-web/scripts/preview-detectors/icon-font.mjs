/**
 * Icon glyphs the system set in its text font (JA Vital, 17/10/2026: a button's icon showed as an empty
 * square, its icon font replaced by the system's body family). A slot rule that sets
 * `font-family: var(--ds-font-body)` on a broad selector (`*`, `body *`, `button`, `[class*=…]`)
 * reaches the `<i>` and the ::before that draw the glyph; the text font has no glyph at that code point
 * and the browser draws tofu. template-fonts-left reads words only, no rule read an icon's family.
 *
 * A finding is a glyph whose first family is an icon font on the template's own page and is not one on
 * the worn page (`lib/icons.mjs`).
 */
import { ICON_FAMILY, ICONS_IN_PAGE } from './lib/icons.mjs'

export const kind = 'icon-font'
/** Dormant until the preview probe reaches this version (index.mjs). */
export const since = 10

export const probe = `(() => {${ICONS_IN_PAGE}
  return icons().map(({ path, at, family, icon }) => ({ path, at, family, icon }))
})()`

/** @param {{ worn: any, plain: any }} input */
export function detect({ worn, plain }) {
  const wornOf = new Map((worn?.data ?? []).map((/** @type {any} */ x) => [x.path, x]))
  const findings = (plain?.data ?? [])
    .filter((/** @type {any} */ was) => {
      const now = wornOf.get(was.path)
      return was.icon && now && !ICON_FAMILY.test(now.family)
    })
    .map((/** @type {any} */ was) => ({
      at: was.at,
      why: `icon font ${was.family} became ${wornOf.get(was.path).family}`,
      by: 'system'
    }))
  return { count: findings.length, findings }
}
