// Menu blocks of the content map: a block whose own settings name a menu (a footer column, a side menu, the main
// menu) shows that menu's items. The map gets, per block, `menuBlocks["<block>"]`: the menu, its items in display order
// with their level and parent, each item's label slot with its slot-fit character limit, where the item leads, and
// whether that target opened on the crawl. The block is found by its settings (a `menutype` naming a menu that has
// items), never by its type, title or position.
//
// Display order is the menu tree's (`lft`) when the presentation lock carries it; otherwise a depth-first walk with
// siblings in id order, said in `orderFrom: "item-id"`.
import { normHref } from './normalize.mjs'

const PUBLISHED = '1'

function objectOf(raw) {
  if (raw && typeof raw === 'object') return raw
  try {
    const v = JSON.parse(String(raw ?? '{}'))
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
const whole = (v) => (v === undefined || v === null || v === '' ? null : Number(v))
const pathOf = (href) => {
  try {
    const u = new URL(href, 'http://site.invalid/')
    return /^https?:$/.test(u.protocol) ? u.pathname + u.search : null
  } catch {
    return null
  }
}

/** What the crawl measured: status by map page entity and by normalized URL. */
function crawlIndex(findings) {
  const byPage = new Map()
  const byUrl = new Map()
  const base = 'http://site.invalid/'
  const put = (url, status) => {
    const k = url ? normHref(pathOf(url) ?? url, base) : ''
    if (k && !byUrl.has(k)) byUrl.set(k, status)
  }
  for (const p of findings?.pages ?? []) {
    const status = p.status ?? 200
    for (const m of p.mapPages ?? []) if (!byPage.has(m.entity)) byPage.set(m.entity, status)
    put(p.url, status)
    put(p.requested, status)
  }
  for (const f of findings?.failures ?? []) {
    if (f.mapPage && !byPage.has(f.mapPage)) byPage.set(f.mapPage, f.status ?? null)
    put(f.url, f.status ?? null)
  }
  for (const d of findings?.duplicates ?? []) put(d.url, 200)
  return {
    page: (entity) => (byPage.has(entity) ? byPage.get(entity) : undefined),
    url: (path) => {
      const k = path ? normHref(path, base) : ''
      return k && byUrl.has(k) ? byUrl.get(k) : undefined
    }
  }
}

const verdict = (status) =>
  status === undefined || status === null
    ? { alive: status === null ? false : null, status: null }
    : { alive: status >= 200 && status < 400, status }

/** Where a menu item leads, from its own row; the path a visitor's link carries comes from the crawl. */
function targetOf(key, row, crawlPath, crawl) {
  const type = String(row.type ?? '')
  const link = String(row.link ?? '').trim()
  const fromPage = (kind, page) => {
    const byPage = crawl.page(page)
    const byPath = crawlPath ? crawl.url(crawlPath) : undefined
    return { kind, page, path: crawlPath, ...verdict(byPage !== undefined ? byPage : byPath) }
  }
  if (type === 'heading' || type === 'separator') return { kind: type, alive: null, status: null }
  if (type === 'alias') {
    const to = whole(objectOf(row.params).aliasoptions)
    return to ? fromPage('alias', `menuItem-${to}`) : { kind: 'none', alive: false, status: null }
  }
  if (type === 'url') {
    if (!link || link.startsWith('#') || /^javascript:/i.test(link))
      return { kind: 'none', alive: false, status: null }
    const item = /^index\.php\?Itemid=(\d+)$/i.exec(link)
    if (item) return fromPage('page', `menuItem-${item[1]}`)
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return { kind: 'url', url: link, alive: null, status: null }
    return { kind: 'link', link, path: crawlPath, ...verdict(crawlPath ? crawl.url(crawlPath) : undefined) }
  }
  return fromPage('page', key)
}

/** The items of one menu a block holds, by its level settings, in display order. */
function itemsOfMenu(rows, settings) {
  const start = Math.max(1, whole(settings.startLevel) ?? 1)
  const end = whole(settings.endLevel) ?? 0
  const allChildren = settings.showAllChildren === undefined || String(settings.showAllChildren) !== '0'
  const base = whole(settings.base)
  const parentOf = new Map(rows.map(([k, r]) => [k, whole(r.parent_id)]))
  const under = (k, id) => {
    for (let p = parentOf.get(k), hop = 0; p && hop < 20; p = parentOf.get(`menuItem-${p}`), hop++)
      if (p === id) return true
    return false
  }
  const kept = rows.filter(([k, r]) => {
    const level = whole(r.level) ?? 1
    if (level < start || (end > 0 && level > end)) return false
    if (!allChildren && level > start) return false
    return !base || under(k, base)
  })
  const byTree = kept.every(([, r]) => whole(r.lft) !== null)
  if (byTree)
    return { orderFrom: 'menu-tree', kept: kept.sort(([, a], [, b]) => whole(a.lft) - whole(b.lft)) }
  // Depth-first, siblings by id.
  const id = (k) => Number(k.replace(/^menuItem-/, ''))
  const keys = new Set(kept.map(([k]) => k))
  const children = new Map()
  for (const [k, r] of kept) {
    const p = `menuItem-${whole(r.parent_id)}`
    const parent = keys.has(p) ? p : null
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent).push([k, r])
  }
  const out = []
  const walk = (parent) => {
    for (const kr of (children.get(parent) ?? []).sort(([a], [b]) => id(a) - id(b))) {
      out.push(kr)
      walk(kr[0])
    }
  }
  walk(null)
  return { orderFrom: 'item-id', kept: out }
}

const VISITOR_ACCESS = new Set(['1', '5'])

/**
 * Menu blocks of a content map, from its presentation lock (block settings, menu rows) and the audit's findings.
 * @param {{map: any, lock: any, findings: any}} input
 * @returns {{menuBlocks: Record<string, any>}}
 */
export function menuBlocksOf({ map, lock, findings }) {
  const lockRows = Object.entries(lock?.entities ?? {})
  // A visitor who has not signed in sees the items of the public (1) and guest (5) access levels only: an item for
  // registered users or administrators ("Your Profile", "Site Settings") is never drawn on the pages a site build plans.
  const menuRows = lockRows.filter(
    ([k, r]) =>
      k.startsWith('menuItem-') &&
      r?.menutype &&
      String(r.published ?? PUBLISHED) === PUBLISHED &&
      VISITOR_ACCESS.has(String(r.access ?? '1'))
  )
  const menus = new Set(menuRows.map(([, r]) => r.menutype))
  const slots = map.slots ?? []
  const labelOf = (key) => slots.find((s) => s.entity === key && s.column === 'title') ?? null
  const crawl = crawlIndex(findings)
  const menuBlocks = {}
  for (const block of (map.entities ?? []).filter((e) => e.kind === 'module')) {
    const settings = objectOf(lock?.entities?.[block.key]?.params)
    const menu = typeof settings.menutype === 'string' ? settings.menutype : null
    if (!menu || !menus.has(menu)) continue
    const inScope = new RegExp(`^(?:mod|module)[-_a-z]*0*${block.sourceId}$`, 'i')
    // The href a visitor's link carries, from a crawled label inside this block whose words are only this item's label.
    const crawled = new Map()
    for (const page of findings?.pages ?? [])
      for (const it of page.items ?? []) {
        if (it.kind !== 'text' || !it.href || !(it.scopes ?? []).some((s) => inScope.test(s))) continue
        const labels = (it.slots ?? []).filter((k) => /^menuItem-\d+\.0$/.test(k))
        if (labels.length !== 1) continue
        const key = labels[0].replace(/\.0$/, '')
        if (!crawled.has(key)) crawled.set(key, pathOf(it.href))
      }
    const { orderFrom, kept } = itemsOfMenu(
      menuRows.filter(([, r]) => r.menutype === menu),
      settings
    )
    const keys = new Set(kept.map(([k]) => k))
    const items = kept.map(([key, row]) => {
      const slot = labelOf(key)
      const limit =
        slot?.fit?.measured && Number.isFinite(slot.fit.maxCharacters)
          ? { maxCharacters: slot.fit.maxCharacters, limitFrom: 'slot-fit' }
          : Number.isFinite(slot?.maxCharacters)
            ? { maxCharacters: slot.maxCharacters, limitFrom: 'store' }
            : {}
      const parent = `menuItem-${whole(row.parent_id)}`
      return {
        item: key,
        level: whole(row.level) ?? 1,
        parent: keys.has(parent) ? parent : null,
        type: row.type ?? null,
        label: slot ? { slot: slot.key, text: slot.sample ?? null, ...limit } : null,
        target: targetOf(key, row, crawled.get(key) ?? null, crawl)
      }
    })
    menuBlocks[block.key] = {
      block: block.key,
      menu,
      titleSlot: slots.find((s) => s.entity === block.key && s.column === 'title')?.key ?? null,
      startLevel: Math.max(1, whole(settings.startLevel) ?? 1),
      endLevel: whole(settings.endLevel) ?? 0,
      orderFrom,
      items
    }
  }
  return { menuBlocks }
}
