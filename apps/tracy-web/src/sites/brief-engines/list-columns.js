/**
 * A card list that lost demo cards keeps a whole row (spec TracyHQ/tracy#189, product owner 29/10/2026): when fewer real
 * cards stay than the template's row holds, the list's own column setting is lowered to the cards kept, so two coaches of
 * a four-column team list fill the row instead of leaving half of it empty. Any card list of a module (team, offerings,
 * testimonials), any template: the setting is read by its name beside the list, never by template.
 *
 * 🔒 ONLY THE TEMPLATE'S OWN SETTING: the value keeps its shape (a string, or a list of one string), is never raised, and
 * is one the 12-column grid divides (1, 2, 3, 4, 6), so the template's own column classes stay whole. A list with no such
 * setting is left as it is.
 */

/** Column counts a 12-column grid draws whole. */
const GRID_COLUMNS = [1, 2, 3, 4, 6, 12]
/** The name of a list's column setting: `columns`, `cols`, `teams-intro[columns]`, `items[per-row]`. */
const COLUMN_KEY = /(?:^|\[)(?:columns?|cols?|per[-_]?row|items[-_]?per[-_]?row)\]?$/i

/** The number a setting holds, and a writer that keeps its shape; null when it holds no single whole number. */
function settingOf(value) {
  const raw = Array.isArray(value) && value.length === 1 ? value[0] : value
  if (typeof raw !== 'string' && typeof raw !== 'number') return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  const write = (next) => {
    const one = typeof raw === 'number' ? next : String(next)
    return Array.isArray(value) ? [one] : one
  }
  return { n, write }
}

/** The largest column count the grid draws whole that is at most `kept`. */
const gridFit = (kept) => GRID_COLUMNS.filter((c) => c <= kept).at(-1) ?? 1

/** A list object's own bookkeeping (`{rows, cols, type: 'list'}` of the ACM admin form) is no column setting. */
const isListBookkeeping = (holder) => holder?.type === 'list'

/**
 * Lowers the column setting beside one list to the cards kept. `parentObjects`: the object holding the list's fields,
 * then the object holding that one; the first setting found wins.
 * @param {Array<Record<string, any> | null | undefined>} parentObjects
 * @param {number} kept - cards of the list that still show
 * @returns {{key: string, from: number, to: number} | null} the change, or null when none was needed or possible
 */
export function fitListColumns(parentObjects, kept) {
  if (!Number.isInteger(kept) || kept < 1) return null
  for (const holder of parentObjects) {
    if (!holder || typeof holder !== 'object' || Array.isArray(holder) || isListBookkeeping(holder)) continue
    for (const [key, value] of Object.entries(holder)) {
      if (!COLUMN_KEY.test(key)) continue
      const setting = settingOf(value)
      if (!setting) continue
      if (setting.n <= kept) return null
      const to = Math.min(setting.n, gridFit(kept))
      holder[key] = setting.write(to)
      return { key, from: setting.n, to }
    }
  }
  return null
}
