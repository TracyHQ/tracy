// The pages a run keeps, as paths. Shared: the site check opens them and the write step bench reads the template's
// stylesheets from them (write-step/site-sheets.js), and the write step's finisher shoots them, so it is in lib/ (module-graph.test.mjs). Pure.
import { addressMoves, addressNow } from './renamed-addresses.js'

/**
 * The kept pages as the host opens them, each with the kit page it is when the write report says (`id`, else null). Joomla's
 * home menu item is `home`, every other route is its path. The write report says which pages the plan keeps; the site's own
 * list also holds every route of the quickstart, the dropped ones too, so it is read only when the report lists none.
 * @returns {{ path: string, id: string | null }[]}
 */
export function keptPageList(inspect, report = {}) {
  const pages = []
  const add = (path, id) => {
    if (!pages.some((p) => p.path === path)) pages.push({ path, id })
  }
  if (Array.isArray(report?.keptPages) && report.keptPages.length) {
    // A page an older report lists at its demo address, under a parent the route stage renamed, answers there now (card AE).
    const moves = addressMoves(report.routes)
    for (const page of report.keptPages) {
      const listed = `/${String(page?.path ?? '').replace(/^\/+/, '')}`
      add(
        (listed !== '/' && addressNow(listed, moves)) || listed,
        typeof page?.id === 'string' ? page.id : null
      )
    }
    return pages
  }
  for (const page of Array.isArray(inspect?.pages) ? inspect.pages : []) {
    const route = String(page?.route ?? '').replace(/^\/+/, '')
    add(route === '' || route === 'home' ? '/' : `/${route}`, null)
  }
  return pages
}

/** The kept pages' paths (keptPageList), as the site check opens them. */
export const keptPaths = (inspect, report = {}) => keptPageList(inspect, report).map((p) => p.path)
