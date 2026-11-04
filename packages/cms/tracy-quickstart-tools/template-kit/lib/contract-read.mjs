// Read a contract's content map and coverage file for the kit tool. The site's front page may carry any alias
// ("homepage"), and its address is still `/`; the presentation lock says which menu item is the front page. Every
// page path in the tool starts from a map route, so the route is settled here once, on the way in.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'))
const readIf = (file) => (existsSync(file) ? readJson(file) : null)

/** The menu item the lock marks as the site's front page, the all-languages one when several are marked. */
function frontPageEntity(lock) {
  const rows = Object.entries(lock?.entities ?? {}).filter(
    ([key, e]) => key.startsWith('menuItem-') && String(e?.home) === '1'
  )
  return (rows.find(([, e]) => e.language == null || e.language === '*') ?? rows[0])?.[0] ?? null
}

/** The route the front page goes by in this map, null when it is already `home` or the map does not name it. */
function aliasOfFrontPage(pages, lock) {
  if (pages.some((p) => p.route === 'home')) return null
  const key = frontPageEntity(lock)
  return (key && pages.find((p) => p.entity === key)?.route) || null
}

/**
 * The content map with its front page routed as `home`. A map that already says so comes back as it is.
 * @param {object} map
 * @param {object | null} lock presentation-lock.json
 */
export function withHomeRoute(map, lock) {
  const alias = aliasOfFrontPage(map.pages ?? [], lock)
  if (!alias) return map
  const route = (r) => (r === alias ? 'home' : r)
  return {
    ...map,
    pages: map.pages.map((p) => ({ ...p, route: route(p.route) })),
    itemLists: Object.fromEntries(
      Object.entries(map.itemLists ?? {}).map(([key, e]) => [
        key,
        e.source?.route === alias ? { ...e, source: { ...e.source, route: 'home' } } : e
      ])
    )
  }
}

/**
 * The coverage file with its front page routed as `home`, by the map's own pages.
 * @param {object | null} coverage
 * @param {object} map the content map as the contract wrote it
 * @param {object | null} lock presentation-lock.json
 */
export function coverageWithHomeRoute(coverage, map, lock) {
  const alias = aliasOfFrontPage(map.pages ?? [], lock)
  if (!alias || !Array.isArray(coverage?.sitePages)) return coverage
  return {
    ...coverage,
    sitePages: coverage.sitePages.map((r) => (r.route === alias ? { ...r, route: 'home' } : r))
  }
}

/** @param {string} contract the contract folder */
export const readContractMap = (contract) =>
  withHomeRoute(
    readJson(join(contract, 'content-map.json')),
    readIf(join(contract, 'presentation-lock.json'))
  )

/** @param {string} contract the contract folder */
export const readContractCoverage = (contract) =>
  coverageWithHomeRoute(
    readIf(join(contract, 'content-coverage.json')),
    readJson(join(contract, 'content-map.json')),
    readIf(join(contract, 'presentation-lock.json'))
  )
