// The site check's `page-slug` measure (ADR 0044, decision 20): each kept page the plan gives a slug answers at an address that
// ends with it. The write step's route stage renames the page's menu item and keeps a route table in the report
// (write-step/page-route-stage.js); this reads the item's address back as the site answers it now, on its row, or else in
// inspect's pages (captured with the contract, so from before any rename). A page whose item ends with another name blocks on step 9 (write); a page the site
// answers nothing for is unmeasured. When the host read the pages, a kept page that does not answer at its new address blocks too:
// an old demo address that answers 404 is what a rename leaves, and is fine.
import { GroupUnmeasured } from './group-unmeasured.js'
import { pagesRead } from './host-pages.js'
import { pathOfMeasure } from './page-faults.js'

const each = (value) => (Array.isArray(value) ? value : [])
const trimmed = (path) => String(path ?? '').replace(/^\/+|\/+$/g, '')
const LANDED = new Set(['written', 'already'])

/**
 * The address the site answers a menu item at, or null when it says nothing of it. The row is read first: inspect's routes
 * are the paths the contract was captured with, from before the route stage renamed anything (card AE).
 */
async function addressOf(itemId, { routes, read }) {
  try {
    const answer = await read('content.get', { kind: 'menuItem', id: itemId })
    const path = answer?.item?.path
    if (typeof path === 'string' && path) return `/${trimmed(path)}`
  } catch {
    // No row: inspect's route is all the site says.
  }
  return routes.get(itemId) ?? null
}

/** The alias an article holds now, or null when the site says nothing of it. */
async function articleAlias(id, read) {
  try {
    const alias = (await read('content.get', { kind: 'article', id }))?.item?.alias
    return typeof alias === 'string' && alias ? alias : null
  } catch {
    return null
  }
}

/** The pages the host opened that answered an error, by path; empty when no host read the pages. */
async function brokenPaths(context) {
  if (typeof context.host !== 'function') return new Map()
  try {
    const read = await pagesRead(context)
    return new Map(
      each(read.visited)
        .filter((v) => Number(v?.status) >= 400)
        .map((v) => [pathOfMeasure(v.path), Number(v.status)])
    )
  } catch {
    return new Map()
  }
}

async function run(context) {
  const { report, read } = context
  const table = each(report?.routes)
  const inspect = await read('content.contract', { operation: 'inspect' })
  const routes = new Map(
    each(inspect?.pages)
      .filter((p) => /^menuItem-\d+$/.test(String(p?.entity ?? '')) && typeof p.route === 'string')
      .map((p) => [Number(String(p.entity).slice('menuItem-'.length)), `/${trimmed(p.route)}`])
  )
  const broken = await brokenPaths(context)
  const failures = []
  const unread = []
  let checked = 0
  for (const route of table) {
    const where = { page: route.to ?? route.from ?? null, slot: `${route.pageId}:slug` }
    // A page its parent item opens took the slug as its article's alias (card P): the article is read for it.
    if (!route.itemId && route.via === 'article' && route.articleId) {
      const alias = await articleAlias(route.articleId, read)
      if (alias === null) {
        unread.push(`${route.pageId} (the site answers nothing for article ${route.articleId})`)
        continue
      }
      checked++
      if (alias !== route.slug)
        failures.push({
          ...where,
          measured: alias,
          reason: `${route.pageId} is its article's address, and the article answers at "${alias}", not its plan slug "${route.slug}"`
        })
      continue
    }
    if (!route.itemId) {
      unread.push(`${route.pageId} (the write report names no menu item for it)`)
      continue
    }
    const address = await addressOf(route.itemId, { routes, read })
    if (address === null) {
      unread.push(`${route.pageId} (the site answers nothing for menu item ${route.itemId})`)
      continue
    }
    checked++
    if (trimmed(address).split('/').at(-1) !== route.slug) {
      failures.push({
        ...where,
        page: address,
        measured: address,
        reason: `The main menu opens ${route.pageId} at ${address}, which does not end with its plan slug "${route.slug}"`
      })
      continue
    }
    const status = broken.get(pathOfMeasure(address))
    if (LANDED.has(route.outcome) && status)
      failures.push({
        ...where,
        page: address,
        measured: status,
        reason: `${route.pageId} does not answer at its new address ${address} (${status})`
      })
  }
  if (!failures.length && unread.length)
    throw new GroupUnmeasured(`No address was read for ${unread.join(', ')}, so this was not measured.`)
  for (const page of unread) failures.push({ level: 'warn', reason: `Not measured: ${page}` })
  return { checked, failures }
}

export const pageSlugGroup = { name: 'page-slug', causingStep: 9, run }

/** The report carries a route table: the write step that made it renamed kept pages, so the measure runs. */
export const hasRouteTable = (report) => each(report?.routes).length > 0

/**
 * The demo baseline at the addresses the pages answer at now: it was measured on the untouched demo, at the demo's addresses,
 * and the page measures compare a written page with it by address.
 * @param {object | null} baseline
 * @param {object[] | undefined} routes the write report's route table
 */
export function baselineAtRoutes(baseline, routes) {
  if (!baseline) return baseline
  const moved = new Map(
    each(routes)
      .filter((r) => LANDED.has(r?.outcome) && r.from && r.to && r.from !== r.to)
      .map((r) => [pathOfMeasure(r.from), r.to])
  )
  if (!moved.size) return baseline
  const at = (path) => moved.get(pathOfMeasure(path)) ?? path
  const out = { ...baseline }
  for (const name of ['blocks', 'textBlocks', 'over', 'maps'])
    if (Array.isArray(baseline[name])) out[name] = baseline[name].map((b) => ({ ...b, page: at(b.page) }))
  if (Array.isArray(baseline.unread)) out.unread = baseline.unread.map((u) => ({ ...u, path: at(u.path) }))
  if (Array.isArray(baseline.read)) out.read = baseline.read.map((p) => (typeof p === 'string' ? at(p) : p))
  return out
}
