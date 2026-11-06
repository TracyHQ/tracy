// The pages a run keeps, as paths. Shared: the site check opens them and the write step bench reads the template's
// stylesheets from them (write-step/site-sheets.js), so it is in lib/ (module-graph.test.mjs). Pure.
import { addressMoves, addressNow } from './renamed-addresses.js'

/**
 * A kept page's path as the host opens it: Joomla's home menu item is `home`, every other route is its path. The write report
 * says which pages the plan keeps; the site's own list also holds every route of the quickstart, the dropped ones too.
 */
export function keptPaths(inspect, report = {}) {
  const paths = []
  if (Array.isArray(report?.keptPages) && report.keptPages.length) {
    // A page an older report lists at its demo address, under a parent the route stage renamed, answers there now (card AE).
    const moves = addressMoves(report.routes)
    for (const page of report.keptPages) {
      const listed = `/${String(page?.path ?? '').replace(/^\/+/, '')}`
      const p = (listed !== '/' && addressNow(listed, moves)) || listed
      if (!paths.includes(p)) paths.push(p)
    }
    return paths
  }
  for (const page of Array.isArray(inspect?.pages) ? inspect.pages : []) {
    const route = String(page?.route ?? '').replace(/^\/+/, '')
    const p = route === '' || route === 'home' ? '/' : `/${route}`
    if (!paths.includes(p)) paths.push(p)
  }
  return paths
}
