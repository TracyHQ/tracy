/**
 * The brief's fact sheet as one copy-plan call carries it (`brief-fact-sheet.js` of tracy-web builds the sheet): whole,
 * or, for a catalogue past `OFFERINGS_WHOLE_MAX` (a restaurant of 150 dishes, a shop of 500 products), the full records of
 * the offerings the call's slots write about and the bare names of the others. CMS-neutral.
 */

/** Offerings at most sent whole with every call. */
export const OFFERINGS_WHOLE_MAX = 24

/**
 * @param {any} sheet - the brief's fact sheet, or null
 * @param {string[]} named - the offerings the call's slots write about
 */
export function factSheetFor(sheet, named) {
  if (!sheet || !Array.isArray(sheet.offerings) || sheet.offerings.length <= OFFERINGS_WHOLE_MAX) return sheet
  const wanted = new Set(named.map((n) => String(n).toLowerCase()))
  const own = (/** @type {any} */ o) => wanted.has(String(o?.name ?? '').toLowerCase())
  return {
    ...sheet,
    offerings: sheet.offerings.filter(own),
    otherOfferings: sheet.offerings.filter((o) => !own(o)).map((o) => o.name)
  }
}
