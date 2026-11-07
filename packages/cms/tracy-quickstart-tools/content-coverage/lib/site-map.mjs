// The site map of the coverage file (audit 1.6.0): every page the content map declares with whether it really opens
// on the site and where it sits in the menus, and the header a visitor sees (logo, menu items, buttons, text).
// Built from what the audit measured; a page the run never reached is `not-checked`, never live or broken.
import { createMatcher } from './match.mjs'
import { normHref, normText } from './normalize.mjs'

/** Menu item types that never render a page of their own (Joomla). */
const GROUP_TYPES = new Set(['heading', 'separator'])

const pathOf = (url) => {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  } catch {
    return String(url)
  }
}
const routePath = (route) => (route === 'home' ? '/' : `/${String(route ?? '').toLowerCase()}`)
const pointsNowhere = (href) =>
  href === null || href === undefined || /^\s*(#.*)?$|^\s*javascript:/i.test(href)

/** What the run measured, indexed by normalized URL: live pages, failures and crawl duplicates of a map page. */
function measuredIndex(result, siteUrl) {
  const byUrl = new Map()
  const put = (url, v) => {
    const k = normHref(url, siteUrl)
    if (k && !byUrl.has(k)) byUrl.set(k, v)
  }
  for (const p of result.pages ?? []) {
    const v = { opens: 'live', status: p.status ?? null, url: pathOf(p.url), page: p.mapPages?.[0]?.entity }
    put(p.url, v)
    if (p.requested) put(p.requested, v)
  }
  for (const f of result.failures ?? [])
    put(f.url, { opens: 'broken', status: f.status ?? null, error: f.error, page: f.mapPage })
  for (const d of result.duplicates ?? []) put(d.url, { opens: 'live', url: pathOf(d.url), page: d.sameAs })
  return byUrl
}

/** One row per map page, in map order, without `inHeader` (it needs the header resolved against these rows). */
function pageRows(contract, result) {
  const live = new Map()
  for (const p of result.pages ?? [])
    for (const m of p.mapPages ?? []) if (!live.has(m.entity)) live.set(m.entity, p)
  const failed = new Map((result.failures ?? []).filter((f) => f.mapPage).map((f) => [f.mapPage, f]))
  const offsite = new Map((result.offsite ?? []).filter((o) => o.mapPage).map((o) => [o.mapPage, o]))
  const keyOfId = new Map((contract.pages ?? []).map((p) => [String(p.sourceId), p.entity]))
  const mainMenu = (contract.pages ?? []).find((p) => p.home)?.menu ?? null
  const rows = (contract.pages ?? []).map((p) => {
    const row = {
      entity: p.entity,
      title: p.title ?? null,
      route: p.route ?? null,
      menu: p.menu ?? null,
      level: p.level ?? null,
      parent: p.parentId > 1 ? (keyOfId.get(String(p.parentId)) ?? null) : null,
      type: p.type ?? null,
      // The main menu is the menu that holds the home item; without menus (WordPress) nothing is claimed.
      inMainMenu: mainMenu && p.menu ? p.menu === mainMenu : null,
      ...(p.menuShow === false ? { shownInMenu: false } : {})
    }
    if (p.published !== undefined && String(p.published) !== '1')
      return { ...row, opens: 'unpublished', reason: `menu item not published (${p.published})` }
    if (GROUP_TYPES.has(p.type))
      return {
        ...row,
        opens: 'no-page',
        reason: `menu type ${p.type} is a menu group with no page of its own`
      }
    if (p.type === 'url')
      return pointsNowhere(p.link)
        ? { ...row, opens: 'no-page', reason: 'links to # (a menu entry with no page)' }
        : { ...row, opens: 'link', href: p.link }
    if (p.type === 'alias') return { ...row, aliasTarget: p.aliasOf }
    const page = live.get(p.entity)
    if (page) return { ...row, opens: 'live', status: page.status ?? null, url: pathOf(page.url) }
    const fail = failed.get(p.entity)
    if (fail)
      return {
        ...row,
        opens: 'broken',
        status: fail.status ?? null,
        ...(fail.error ? { error: fail.error } : {})
      }
    const off = offsite.get(p.entity)
    if (off) return { ...row, opens: 'offsite', landedOn: off.landedOn }
    return {
      ...row,
      opens: 'not-checked',
      reason: result.capReached ? 'page cap reached' : 'not reached by the run'
    }
  })
  // An alias opens the page of the item it points to.
  const byKey = new Map(rows.map((r) => [r.entity, r]))
  for (const r of rows) {
    if (!Object.hasOwn(r, 'aliasTarget')) continue
    const target = byKey.get(keyOfId.get(String(r.aliasTarget)))
    delete r.aliasTarget
    if (!target)
      Object.assign(r, { opens: 'not-checked', reason: 'alias to an item outside the content map' })
    else
      Object.assign(r, {
        aliasOf: target.entity,
        opens: target.opens,
        ...(target.status !== undefined ? { status: target.status } : {}),
        ...(target.url ? { url: target.url } : {})
      })
  }
  return rows
}

/** Where a header link leads: a map page's row by its URL or route, or what the run measured at that URL. */
function resolver(contract, result, rows) {
  const siteUrl = result.site
  const host = new URL(siteUrl).host
  const measured = measuredIndex(result, siteUrl)
  const rowOf = new Map(rows.map((r) => [r.entity, r]))
  const byRoute = new Map(
    (contract.pages ?? []).map((p) => [normHref(routePath(p.route), siteUrl), p.entity])
  )
  return (href) => {
    if (pointsNowhere(href)) return { opens: 'no-page' }
    let u
    try {
      u = new URL(href, siteUrl)
    } catch {
      return { opens: 'not-checked' }
    }
    if (!/^https?:$/.test(u.protocol) || u.host !== host) return { opens: 'external' }
    const key = normHref(href, siteUrl)
    const hit = measured.get(key)
    if (hit) {
      // A failure's error text stays in the page row; a header entry names only where it leads.
      return Object.fromEntries(
        Object.entries(hit).filter(([k, v]) => k !== 'error' && v !== undefined && v !== null)
      )
    }
    const entity = byRoute.get(key)
    const row = entity && rowOf.get(entity)
    if (row) return { opens: row.opens, ...(row.status ? { status: row.status } : {}), page: entity }
    return { opens: 'not-checked' }
  }
}

function headerParts(contract, result, rows) {
  const raw = result.header
  if (!raw || raw.found === false || !result.site) return null
  const match = createMatcher(contract, result.site)
  const leads = resolver(contract, result, rows)
  const slotsOf = (item) => {
    const m = match(item)
    return m.status === 'matched' ? (m.slots ?? []) : []
  }
  // WordPress prints its own address in every src and href: the file keeps the path, never the measured machine.
  const origin = new URL(result.site).origin
  const local = (u) =>
    typeof u === 'string' && u.startsWith(`${origin}/`) ? u.slice(origin.length) : (u ?? null)
  const logo = raw.logo
    ? {
        image: local(raw.logo.image),
        alt: raw.logo.alt ?? null,
        text: raw.logo.text ?? null,
        href: local(raw.logo.href),
        slots: raw.logo.image ? slotsOf({ kind: 'image', value: raw.logo.image }) : []
      }
    : null
  const menu = (raw.menu ?? []).map((m) => ({
    text: m.text,
    href: local(m.href),
    depth: m.depth ?? 0,
    visible: m.visible !== false,
    ...leads(m.href),
    slots: slotsOf({ kind: 'text', value: m.text })
  }))
  const buttons = (raw.buttons ?? []).map((b) => ({
    text: b.text,
    href: local(b.href),
    iconOnly: b.iconOnly === true,
    visible: b.visible !== false,
    opens: b.href ? leads(b.href).opens : null,
    slots: b.iconOnly ? [] : slotsOf({ kind: 'text', value: b.text })
  }))
  const texts = (raw.texts ?? []).map((t) => {
    const slots = slotsOf({ kind: 'text', value: t.value })
    return { value: t.value, visible: t.visible !== false, editable: slots.length > 0, slots }
  })
  return { measuredOn: raw.measuredOn ?? null, viewport: raw.viewport ?? null, logo, menu, buttons, texts }
}

/** The header a visitor sees, or null when the run measured none (an older findings file, a page with no header). */
export function headerOf({ contract, result }) {
  return headerParts(contract, result, pageRows(contract, result))
}

/** Every map page with `opens` (live, broken, no-page, link, unpublished, offsite, not-checked) and its menu place. */
export function sitePagesOf({ contract, result }) {
  const rows = pageRows(contract, result)
  const header = headerParts(contract, result, rows)
  if (!header) return rows.map((r) => ({ ...r, inHeader: null }))
  const pagesInHeader = new Set(header.menu.map((m) => m.page).filter(Boolean))
  const titlesInHeader = new Set(header.menu.map((m) => normText(m.text)))
  return rows.map((r) => ({
    ...r,
    inHeader: pagesInHeader.has(r.entity) || (r.title !== null && titlesInHeader.has(normText(r.title)))
  }))
}
