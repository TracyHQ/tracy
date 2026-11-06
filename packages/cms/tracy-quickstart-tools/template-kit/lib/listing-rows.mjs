// The most items a listing page shows. A listing pages through as many items as exist, so its `max` is the
// page size: read from the pager when a later list position exists (`?start=N` means N per page), else from the
// page-size control the listing prints, else the item rows the demo shows on the page. Item rows are told from other repeated rows by their links: every
// row opens a different content item page.
import { canonicalPath } from './kit-paths.mjs'

/**
 * The listing's item rows: the biggest set of rows whose every row opens a different content item page. A row
 * opens the first item page among its links (a card may lead with a link to its category); rows of a block
 * nested in the listing (a sidebar module) are that block's.
 */
export function itemRows(repeats, { isItemPage, siteUrl, aliasHosts = [] }) {
  let best = null
  const pathOf = (h) => (h ? canonicalPath(h, siteUrl, aliasHosts) : null)
  for (const r of repeats ?? []) {
    if (r.nested) continue
    const targets = r.rowHrefs
      ? r.rowHrefs.map((hrefs) => hrefs.map(pathOf).find((t) => t && isItemPage(t)) ?? null)
      : (r.rowLinks ?? []).map(pathOf)
    if (r.shownCount === 0 || !targets.length || !targets.every((t) => t && isItemPage(t))) continue
    if (new Set(targets).size !== targets.length) continue
    if (!best || r.count > best.count) best = r
  }
  return best
}

/**
 * @param {{path: string, repeats: object[], pagePaths: string[], isItemPage: (path: string) => boolean, siteUrl: string, aliasHosts?: string[], pageSizeControl?: number|null}} o
 * @returns {{max: number, maxSource: string, maxEvidence: object}|null}
 */
export function listingMax({
  path,
  repeats,
  pagePaths,
  isItemPage,
  siteUrl,
  aliasHosts = [],
  pageSizeControl = null
}) {
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
  // No later page: the page-size control the listing prints (its selected number) says how many a page shows.
  if (pageSizeControl > 0)
    return {
      max: pageSizeControl,
      maxSource: 'page-size-control',
      maxEvidence: { pageSizeControl, ...shown }
    }
  if (rows) return { max: rows.count, maxSource: 'captured-rows', maxEvidence: shown }
  return null
}
