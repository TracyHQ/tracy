// The pages a run keeps, as paths. Shared: the site check opens them and the write step bench reads the template's
// stylesheets from them (write-step/site-sheets.js), so it is in lib/ (module-graph.test.mjs). Pure.

/**
 * A kept page's path as the host opens it: Joomla's home menu item is `home`, every other route is its path. The write report
 * says which pages the plan keeps; the site's own list also holds every route of the quickstart, the dropped ones too.
 */
export function keptPaths(inspect, report = {}) {
  const paths = []
  if (Array.isArray(report?.keptPages) && report.keptPages.length) {
    for (const page of report.keptPages) {
      const p = `/${String(page?.path ?? '').replace(/^\/+/, '')}`
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
