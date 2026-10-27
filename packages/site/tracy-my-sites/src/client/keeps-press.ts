/**
 * Whether a press inside a My Sites row cell belongs to that cell's own control, or should reach
 * the row and open its site.
 *
 * The Site (its state's button), Team and "…" cells hold their own controls, and used to stop EVERY press — so a press
 * on the empty part of the Team cell did nothing while the whole row was lit as one button
 * (cowork.tracy.site, 29/09). Now only a press on a control stays in the cell.
 *
 * - The target is outside the cell in the DOM: it is in a portal (the "…" menu, a dialog), which
 *   React still bubbles through the cell. It stays.
 * - The target is inside the cell: it stays only when a control stands between it and the cell.
 *   A control ABOVE the cell does not count, or a dialog wrapping the whole tab would swallow every
 *   press on the list.
 */

/** What counts as a cell's own control. */
export const OWN_CONTROLS =
  'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="menu"], [role="dialog"]'

/** An Element, or anything with the two methods this reads — a test's stand-in passes too. */
const isElementLike = (value: unknown): value is Element =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Element).closest === 'function' &&
  typeof (value as Element).contains === 'function'

/**
 * @param target - where the press landed (`event.target`).
 * @param cell - the cell whose handler is asking (`event.currentTarget`).
 * @returns true to stop the press at the cell, false to let it open the row.
 */
export function keepsPress(target: unknown, cell: Element): boolean {
  if (!isElementLike(target)) return false
  if (!cell.contains(target)) return true
  const control = target.closest(OWN_CONTROLS)
  return control !== null && cell.contains(control)
}
