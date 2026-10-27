/**
 * The EmDash half of REL-2: the `primary` menu of `seed/site-model.json`, every depth, each `path`
 * matched to exactly one page record in the default locale. Home is the record of type `home`, or
 * the one whose slug is `home`.
 *
 * Ported from `tracy-dev site-pages` (`lib/site-pages.mjs`, `emdashIndex` / `emdashPages`).
 */
import { pagesFromMenu, utilityName } from './page-rule.js'

/**
 * Page records of a site model: `pages` rows, and singleton types (one record in the default locale).
 * @param {Record<string, any>} model
 */
function pageRecords(model) {
  const locale = model.locales?.default ?? model.site?.defaultLocale ?? 'en'
  const rows = (model.records ?? []).filter(
    (/** @type {any} */ r) => r.type !== 'site' && (r.locale ?? locale) === locale && r.status !== 'draft'
  )
  /** @type {Record<string, number>} */
  const perType = {}
  for (const r of rows) perType[r.type] = (perType[r.type] ?? 0) + 1
  return rows.filter(
    (/** @type {any} */ r) => r.type === 'pages' || r.type === 'page' || perType[r.type] === 1
  )
}

/**
 * The page records a menu path opens: `/` the home record; otherwise the last path segment as a
 * record slug, then as a record type, then with `_page` appended (`/services` → `services_page`).
 * @param {any[]} records @param {string | null} home @param {string} path
 */
function recordsAtPath(records, home, path) {
  if (path === '/') return records.filter((r) => r.slug === home)
  const segment = path
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .pop()
  const tests = [
    (/** @type {any} */ r) => r.slug === segment,
    (/** @type {any} */ r) => r.type === segment,
    (/** @type {any} */ r) => r.slug === `${segment}_page` || r.type === `${segment}_page`
  ]
  for (const test of tests) {
    const hits = records.filter(test)
    if (hits.length) return hits
  }
  return []
}

/**
 * Every menu path (all menus, every depth) that opens exactly one page record, per record slug,
 * without the leading and trailing slash: `services_page` → `['services']`. A page id is a record
 * slug, while a theme's link gate is keyed by path (PAGE-4, PAGE-7).
 * @param {Record<string, any>} model @param {any[]} records @param {string | null} home
 */
function menuPathsBySlug(model, records, home) {
  /** @type {Map<string, Set<string>>} */
  const out = new Map()
  const walk = (/** @type {any[]} */ items) => {
    for (const item of items ?? []) {
      if (typeof item.path === 'string' && item.path.startsWith('/')) {
        const hits = recordsAtPath(records, home, item.path)
        if (hits.length === 1) {
          const path = item.path.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '')
          const slug = hits[0].slug
          if (!out.has(slug)) out.set(slug, new Set())
          out.get(slug)?.add(path)
        }
      }
      walk(item.children)
    }
  }
  for (const menu of model.menus ?? []) walk(menu.items)
  return out
}

/** @param {Record<string, any>} model the parsed `seed/site-model.json` */
export function emdashMenu(model) {
  const records = pageRecords(model)
  const homeRecord = records.find((r) => r.type === 'home') ?? records.find((r) => r.slug === 'home')
  /** @type {Map<string, Set<string>> | null} */
  let pathsBySlug = null
  const index = {
    what: 'page record',
    home: homeRecord?.slug ?? null,
    count: (/** @type {string} */ id) => records.filter((r) => r.slug === id).length,
    /** The menu paths that open the record `id`, without slashes (`services_page` → `['services']`). */
    paths: (/** @type {string} */ id) => {
      pathsBySlug ??= menuPathsBySlug(model, records, homeRecord?.slug ?? null)
      return [...(pathsBySlug.get(id) ?? [])]
    }
  }
  const byPath = (/** @type {string} */ path) => recordsAtPath(records, index.home, path)

  /** @param {(message: string) => void} warn */
  function build(warn) {
    const locale = model.locales?.default ?? 'en'
    const menus = model.menus ?? []
    const menu =
      menus.find((/** @type {any} */ m) => m.name === 'primary') ??
      menus.find((/** @type {any} */ m) => /main/.test(m.name)) ??
      menus[0]
    if (!menu) throw new Error('site-model.json has no menu')
    if (menu.name !== 'primary') warn(`no "primary" menu: used "${menu.name}"`)
    const labelOf = (/** @type {any} */ item) =>
      item.label?.[locale] ?? Object.values(item.label ?? {})[0] ?? ''
    /** @returns {import('./page-rule.js').MenuNode} */
    const node = (/** @type {any} */ item) => {
      const label = labelOf(item)
      const children = (item.children ?? []).map(node)
      if (!item.path) return { label, id: null, children }
      const hits = byPath(item.path)
      if (hits.length !== 1) {
        warn(`"${label}" (${item.path}) matches ${hits.length} page records: skipped`)
        return { label, id: null, children }
      }
      const slug = hits[0].slug
      return {
        label,
        id: slug,
        home: slug === index.home || undefined,
        utility: utilityName(label, slug, item.path),
        children
      }
    }
    return pagesFromMenu(
      (menu.items ?? []).map(node),
      {
        homeId: index.home,
        homeTitle: () => records.find((r) => r.slug === index.home)?.values?.title ?? 'Home'
      },
      warn
    )
  }
  return { index, build }
}
