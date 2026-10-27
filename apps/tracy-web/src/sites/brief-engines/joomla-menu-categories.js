/**
 * The menu entries of a Joomla site that lead to a blog category renamed for the customer's trade, given its new name.
 *
 * 🔒 A MENU ITEM THAT LEADS TO A RENAMED CATEGORY CARRIES ITS NEW NAME (L1, product owner after the g65 builds, 12/10/2026,
 * TCH #1013). Measured on dev g65-ess-j-full (JA Essence j6, a bakery, Vietnamese): the categories were renamed for the trade
 * ("Design" → "Quy trình nướng"), but the footer's entries into them still read the demo's names translated ("Thiết kế",
 * "Thời trang"): a category is a record the planner never sees, and its menu entries are labelled on their own. Every published
 * entry of any menu (main, footer, an alias of another entry) that opens a renamed category (`view=category&id=N` of
 * `com_content`) AND is labelled with the category's name (the demo's, or its translation) takes the category's new name, in
 * the same language. An entry labelled otherwise ("Category Style 3", a layout sample) names its page, not the category, and
 * keeps its label: the readiness check judges the same entries (ABOUT-2 `category-menu-labels`, built-site
 * `menu-category-names`). Written with the tidy-up, under its apply id, so one
 * `apply.revert` undoes it with the rest.
 */
import { paramsOf } from './joomla-tidy.js'

/** The article category a menu link opens, or null. */
function categoryOf(/** @type {unknown} */ link) {
  const text = String(link ?? '')
  if (!/[?&]option=com_content(?:&|$)/.test(text) || !/[?&]view=category(?:&|$)/.test(text)) return null
  const id = /[?&]id=(\d+)/.exec(text)
  return id ? Number(id[1]) : null
}

/** Whether two labels are one name: case and spacing set aside. */
const sameName = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.trim().toLocaleLowerCase().replace(/\s+/g, ' ') === b.trim().toLocaleLowerCase().replace(/\s+/g, ' ')

/**
 * The writes that give each menu entry into a renamed category the category's new name.
 * @param {object} input
 * @param {any[]} input.rows - the menu's whole rows (`readMenu`)
 * @param {Map<number, { to: string, names: string[] }>} input.renamed - category id → its new name and the names it was
 *   known by (the demo's, its translation) (`categoryLanguageSteps`)
 * @param {string} input.source - the template's own language: the categories renamed are its
 * @returns {Array<{ kind: 'menuItem', id: number, fields: { title: string } }>}
 */
export function menuCategorySteps({ rows, renamed, source }) {
  if (renamed.size === 0) return []
  const byId = new Map(rows.map((row) => [Number(row.id), row]))
  /** The category an entry opens, following an alias to the entry it stands for. */
  const opens = (/** @type {any} */ row, seen = new Set()) => {
    if (!row || seen.has(Number(row.id))) return null
    seen.add(Number(row.id))
    if (row.type === 'alias') {
      const to = Number(paramsOf(row.params)?.aliasoptions)
      return Number.isInteger(to) && to > 0 ? opens(byId.get(to), seen) : null
    }
    return categoryOf(row.link)
  }
  /** @type {Array<{ kind: 'menuItem', id: number, fields: { title: string } }>} */
  const steps = []
  for (const row of rows) {
    const language = String(row.language ?? '*')
    if (Number(row.published) !== 1 || (language !== '*' && language !== source)) continue
    const category = opens(row)
    const named = category === null ? undefined : renamed.get(category)
    const label = String(row.title ?? '').trim()
    if (named && label !== named.to && named.names.some((name) => sameName(name, label)))
      steps.push({ kind: 'menuItem', id: Number(row.id), fields: { title: named.to } })
  }
  return steps
}
