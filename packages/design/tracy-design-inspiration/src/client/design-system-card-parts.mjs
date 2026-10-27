/**
 * Pure helpers for the Design system tab's card grid (the running site's tab, restyled 12/10/2026 after the
 * Add site form's "Choose a design system" sheet). Ported, not imported: a plugin never imports another plugin's
 * internals, and these are a few lines (`tracy-add-site` `design-system-pick.mjs` `swatchesOf` / `fontOf`).
 *
 * - `swatchesOf`: the system's own palette as the library door sends it (`colors`, accent first), hex only, at
 *   most four. A row with no palette gives none; nothing is guessed.
 * - `fontOf`: the family the "Aa" swatch is drawn in when the library has no picture: the first font in use.
 * - `isWorn`: whether a library row is the system the site wears now (its `slotId` or its `id`).
 */

/** How many dots a card draws, as the Add site sheet does. */
export const SWATCHES_SHOWN = 4

/**
 * @param {{ colors?: unknown } | null | undefined} row
 * @returns {string[]}
 */
export function swatchesOf(row) {
  const list = row?.colors
  if (!Array.isArray(list)) return []
  /** @type {string[]} */
  const out = []
  for (const c of list) {
    if (typeof c !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(c)) continue
    const hex = c.toLowerCase()
    if (!out.includes(hex)) out.push(hex)
    if (out.length >= SWATCHES_SHOWN) break
  }
  return out
}

/**
 * @param {{ fonts?: { use?: string }[] } | null | undefined} row
 * @returns {string | null}
 */
export function fontOf(row) {
  if (!Array.isArray(row?.fonts)) return null
  for (const f of row.fonts) {
    const use = typeof f?.use === 'string' ? f.use.trim() : ''
    if (use) return use
  }
  return null
}

/**
 * @param {{ id: string | null, slotId: string } | null | undefined} worn
 * @param {string} id
 */
export function isWorn(worn, id) {
  return !!worn && (worn.slotId === id || worn.id === id)
}
