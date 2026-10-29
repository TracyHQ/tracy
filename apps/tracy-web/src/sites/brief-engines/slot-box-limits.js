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
 * @template {{type?: string, maxCharacters?: number, maxLines?: number, fit?: any}} T
 * @param {T[]} slots
 * @returns {T[]}
 */
export function withBoxLimits(slots) {
  return slots.map((slot) => {
    if (slot?.type !== 'text') return slot
    const box = boxLimitOf(slot)
    const lines = lineLimitOf(slot)
    // The box's lines go to the writer beside its characters (`maxLines`): the site refuses more line breaks than it holds.
    // Not when the demo's own words break more lines than that (markup laid out on lines, a box measured folded shut): the
    // writer would drop a list to obey it, where joining the lines at the write (`withinLines`) loses nothing.
    const demoLines = typeof slot.sample === 'string' ? slot.sample.split(/\r?\n/).length : 1
    const lined = lines === null || demoLines > lines ? slot : { ...slot, maxLines: lines }
    if (box === null) return lined
    const own = Number.isInteger(slot.maxCharacters) && slot.maxCharacters > 0 ? slot.maxCharacters : Infinity
    return box < own ? { ...lined, maxCharacters: box } : lined
  })
}

/**
 * The lines a text slot's measured box holds, as the plugin reads it (`SlotFit.php` `checkText`: the smallest of `fit.lines`),
 * or null. The plugin counts the line breaks in the words, so a line limit is a limit on line breaks.
 * @param {any} slot
 */
export function lineLimitOf(slot) {
  const fit = slot?.fit
  if (!fit || fit.measured !== true || !fit.lines || typeof fit.lines !== 'object') return null
  const all = Object.values(fit.lines).filter((n) => Number.isInteger(n) && n > 0)
  return all.length ? Math.min(...all) : null
}

/**
 * The words within `limit` lines: the lines past the last one allowed join it, each break a space. Nothing is cut and the
 * length does not grow, so a line within its characters stays within them (ADR 0039 `overflow: "rewrite"`, never an ellipsis).
 * @param {string} value
 * @param {number | null} limit
 */
export function withinLines(value, limit) {
  if (typeof value !== 'string' || !Number.isInteger(limit) || /** @type {number} */ (limit) < 1) return value
  const lines = value.split(/\r?\n/)
  if (lines.length <= /** @type {number} */ (limit)) return value
  const head = lines.slice(0, /** @type {number} */ (limit) - 1)
  const tail = lines
    .slice(/** @type {number} */ (limit) - 1)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
  return [...head, tail].join('\n')
}

/**
 * The line limit of every text slot whose box declares one, by key: what the contract write folds each line to.
 * @param {any[]} slots
 * @returns {Record<string, number>}
 */
export function lineLimits(slots) {
  /** @type {Record<string, number>} */
  const out = {}
  for (const slot of slots) {
    if (slot?.type !== 'text') continue
    const limit = lineLimitOf(slot)
    if (limit !== null) out[slot.key] = limit
  }
  return out
}
