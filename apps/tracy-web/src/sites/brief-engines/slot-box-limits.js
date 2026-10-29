/**
 * A text slot's length limit is the tighter of its contract limit (`maxCharacters`) and its measured box (`fit`).
 *
 * The Claude Cowork plugin refuses words over the slot's measured box (`SlotFit.php` `checkText`: `fit.maxCharacters`,
 * else the smallest of `fit.maxChars`), and a refused line keeps the demo's words. The planner was given only the
 * contract limit, which is often much wider: measured on the local stand (29/10/2026, a brief build on a Joomla T4
 * template), a hero heading had 110 characters by contract and 45 by its box, so the new heading was refused and the
 * demo's heading stayed. Giving the planner the box's limit makes it write lines the site accepts.
 */

/** The measured box's limit of a text slot, as the plugin reads it, or null. */
export function boxLimitOf(slot) {
  const fit = slot?.fit
  if (!fit || fit.measured !== true) return null
  if (Number.isInteger(fit.maxCharacters) && fit.maxCharacters > 0) return fit.maxCharacters
  const all = Object.values(fit.maxChars ?? {}).filter((n) => Number.isInteger(n) && n > 0)
  return all.length ? Math.min(...all) : null
}

/**
 * The slots with each text slot's `maxCharacters` brought down to its measured box.
 * @template {{type?: string, maxCharacters?: number, fit?: any}} T
 * @param {T[]} slots
 * @returns {T[]}
 */
export function withBoxLimits(slots) {
  return slots.map((slot) => {
    if (slot?.type !== 'text') return slot
    const box = boxLimitOf(slot)
    if (box === null) return slot
    const own = Number.isInteger(slot.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : Infinity
    return box < own ? { ...slot, maxCharacters: box } : slot
  })
}
