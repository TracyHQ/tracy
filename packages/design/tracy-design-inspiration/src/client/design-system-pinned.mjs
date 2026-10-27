/**
 * The pinned pair at the head of the Design system tab's grid (Akemi, 13/10/2026, D2). The tab no longer says
 * "Wearing now · <name>" in a row above the cards: the grid itself says it.
 *
 * - The card of the system the site wears is FIRST, with a "Wearing now" badge (and the terracotta stroke it
 *   already had). A worn system the library does not list (an OpenDesign pick from before 12/10/2026) still
 *   gets a card at the front, made from the site's read alone (`synthetic`), so the tab never hides what is on.
 * - Right after it sits the synthetic "Template default" card, the template's own look, with a "Template default"
 *   badge; its action is the way back (the last apply undone). When nothing is worn, that card is first and wears
 *   the "Wearing now" badge instead, so the customer always sees which look is active.
 * - The pair stands while the toolbar narrows nothing. Under a search or a tick the pair follows the filter: the
 *   Template default card (not a system of the library) steps aside, and the worn card shows only when it matched,
 *   still first and still badged. The Add site sheet does the same with its Template default card.
 *
 * Pure, so `node --test` runs it without a build; the grid (`DesignSystemGrid.tsx`) only draws what this says.
 */
import { isWorn } from './design-system-card-parts.mjs'

/**
 * @typedef {import('./design-system-library.mjs').LibrarySystem} LibrarySystem
 * @typedef {LibrarySystem & { synthetic?: true }} GridRow
 * @typedef {{ id: string | null, slotId: string, name: string } | null} Worn
 */

/**
 * The grid's rows in their final order, and where the Template default card goes.
 * @param {{ rows: LibrarySystem[] | null, worn: Worn, filtered: boolean }} input
 *   `rows`: the cards the toolbar let through (null while the library is asked); `worn`: the read's `worn`;
 *   `filtered`: whether the toolbar narrows anything (`isFiltered`).
 * @returns {{ rows: GridRow[] | null, wornFirst: boolean, defaultCard: { badge: 'wearing' | 'default', at: 0 | 1 } | null }}
 *   `wornFirst`: the first row is the worn system's card; `defaultCard.at`: the slot the Template default card takes.
 */
export function pinnedGridOf({ rows, worn, filtered }) {
  if (rows === null) return { rows: null, wornFirst: false, defaultCard: null }
  const at = worn ? rows.findIndex((r) => isWorn(worn, r.id)) : -1
  /** @type {GridRow[]} */
  let ordered = rows
  let wornFirst = false
  if (at >= 0) {
    ordered = [rows[at], ...rows.slice(0, at), ...rows.slice(at + 1)]
    wornFirst = true
  } else if (worn && !filtered) {
    ordered = [syntheticRowOf(worn), ...rows]
    wornFirst = true
  }
  const defaultCard = filtered ? null : { badge: worn ? 'wearing' : 'wearing', at: wornFirst ? 1 : 0 }
  if (defaultCard && worn) defaultCard.badge = 'default'
  return { rows: ordered, wornFirst, defaultCard: /** @type {any} */ (defaultCard) }
}

/**
 * A card for a worn system the library does not list: its name from the site's read, nothing invented (no picture,
 * no palette, no description).
 * @param {NonNullable<Worn>} worn
 * @returns {GridRow}
 */
function syntheticRowOf(worn) {
  return {
    id: worn.slotId,
    kind: 'refero',
    name: worn.name,
    description: '',
    group: '',
    theme: null,
    image: null,
    fonts: [],
    colors: [],
    ok: true,
    synthetic: true
  }
}
