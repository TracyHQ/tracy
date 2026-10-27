/**
 * Test-only: a Joomla release's menu entries, articles, categories and modules as its presentation lock pins them, and where
 * each module shows, as its content map records it (`assignedModules`: `all` → every page, `exclude` → every page but those).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** @param {string} contract - `ja-essence/j6/1.0.4` */
export function release(contract) {
  const dir = fileURLToPath(
    new URL(`../../../packages/cms/tracy-joomla-quickstart/contracts/${contract}/`, import.meta.url)
  )
  const { entities } = JSON.parse(readFileSync(`${dir}presentation-lock.json`, 'utf8'))
  const { pages = [] } = JSON.parse(readFileSync(`${dir}content-map.json`, 'utf8'))
  const of = (/** @type {string} */ kind) =>
    Object.entries(entities)
      .filter(([key]) => key.startsWith(`${kind}-`))
      .map(([key, row]) => ({ id: Number(key.slice(kind.length + 1)), .../** @type {any} */ (row) }))
  /** @type {Map<number, number[]>} */
  const assignments = new Map()
  for (const page of pages)
    for (const a of page.assignedModules ?? []) {
      const id = Number(String(a.entity).split('-')[1])
      const ids = (a.menuIds ?? []).map(Number)
      const menus =
        a.assignmentMode === 'all' ? [0] : a.assignmentMode === 'exclude' ? ids.map((m) => -m) : ids
      assignments.set(id, [...new Set([...(assignments.get(id) ?? []), ...menus])])
    }
  return {
    rows: of('menuItem'),
    articles: of('article'),
    categories: of('category'),
    modules: of('module'),
    assignments
  }
}
