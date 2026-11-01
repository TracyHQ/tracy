// The most items a listing page shows. A listing pages through as many items as exist, so its `max` is the
// page size: read from the pager when a later list position exists (`?start=N` means N per page), else the
// item rows the demo shows on the page. Item rows are told from other repeated rows by their links: every
// row opens a different content item page.
import { canonicalPath } from './kit-paths.mjs'

/** The listing's item rows: the biggest set of rows whose every row opens a different content item page. */
export function itemRows(repeats, { isItemPage, siteUrl, aliasHosts = [] }) {
  let best = null
  for (const r of repeats ?? []) {
    const targets = (r.rowLinks ?? []).map((h) => (h ? canonicalPath(h, siteUrl, aliasHosts) : null))
    if (r.shownCount === 0 || !targets.length || !targets.every((t) => t && isItemPage(t))) continue
    if (new Set(targets).size !== targets.length) continue
    if (!best || r.count > best.count) best = r
  }
  return best
}

/**
 * @param {{path: string, repeats: object[], pagePaths: string[], isItemPage: (path: string) => boolean, siteUrl: string, aliasHosts?: string[]}} o
 * @returns {{max: number, maxSource: string, maxEvidence: object}|null}
 */
export function listingMax({ path, repeats, pagePaths, isItemPage, siteUrl, aliasHosts = [] }) {
  const rows = itemRows(repeats, { isItemPage, siteUrl, aliasHosts })
  const shown = rows ? { rowsShown: rows.count, rows: { path: rows.path, shape: rows.shape } } : {}
  const base = path.split('?')[0]
  const starts = pagePaths
    .filter((p) => p.startsWith(`${base}?start=`))
    .map((p) => Number(p.split('=')[1]))
    .filter((n) => n > 0)
  if (starts.length) {
    const size = Math.min(...starts)
    return { max: size, maxSource: 'page-size', maxEvidence: { nextPage: `${base}?start=${size}`, ...shown } }
  }
  if (rows) return { max: rows.count, maxSource: 'captured-rows', maxEvidence: shown }
  return null
}
