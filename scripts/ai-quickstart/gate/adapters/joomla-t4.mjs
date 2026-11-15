// The Joomla T4 adapter of the gate's renderer (ticket #585): how a page of a built site is addressed, how its theme
// side is picked, and which pages a built site has. Takes the site as input: nothing here names a template.
//   theme   `?theme=dark|light` picks the side for one load and is never saved (the template's own script reads it)
//   pages   every menu item the write created, every article it created reached under the list page that holds it
//           (a block printed only under its list page's menu item, door measurements), and the system pages
//           (product decision 2): search, a missing page, sign in, password reset, username reminder, the contact form
//           when a contact exists; a system page the kit gives a menu item (`systemPagesOf`) is read at that item.

import { WEB_FRAME_RULES } from './web-frame.mjs'

/** The platform the site check and the secret scan know this framework by. */
export const PLATFORM = 'joomla'

/** The exemptions of the pages this framework prints (`exemptions.mjs`): the web frame's. */
export const EXEMPTIONS = WEB_FRAME_RULES

/**
 * The hosts this framework's own pages embed or load by design (an embed from one of them is a note, not a leak): none.
 * A map, a video or a frame from any other host whose address is no marker is a leak (`unmarked_embed`).
 */
export const DECLARED_HOSTS = Object.freeze([])

/** The address of a page on one theme side. */
export function themed(url, theme) {
  const u = new URL(url)
  u.searchParams.set('theme', theme)
  return u.toString()
}

/** The system pages of every Joomla site, by page type. */
export const SYSTEM_PAGES = Object.freeze([
  { pageType: 'system-search', path: 'index.php?option=com_finder&view=search&q=qqqqq' },
  { pageType: 'system-404', path: 'index.php/qx-no-such-page', status: 404 },
  { pageType: 'system-login', path: 'index.php?option=com_users&view=login' },
  { pageType: 'system-reset', path: 'index.php?option=com_users&view=reset' },
  { pageType: 'system-remind', path: 'index.php?option=com_users&view=remind' }
])

/**
 * The system pages of a built site: a kit that declares a `system-menu` data fix (`mapping.dataFixes`, #587) gives a
 * system page a menu item of its own, so the page prints under its own style and title; such a page is read at its
 * item (`index.php/<alias>`, with the raw address's own query words kept, the search words). The rest keep the raw
 * component address. The aliases are read from the mapping, never written here.
 */
export function systemPagesOf(mapping) {
  const fix = (Array.isArray(mapping?.dataFixes) ? mapping.dataFixes : []).find(
    (f) => f?.id === 'system-menu'
  )
  const items = new Map((Array.isArray(fix?.items) ? fix.items : []).map((i) => [i?.page, i]))
  return SYSTEM_PAGES.map((s) => {
    const alias = items.get(s.pageType)?.alias
    if (typeof alias !== 'string' || !alias.trim()) return s
    const query = new URLSearchParams(s.path.split('?')[1] ?? '')
    for (const k of ['option', 'view', 'Itemid']) query.delete(k)
    const rest = query.toString()
    return { ...s, path: `index.php/${encodeURIComponent(alias.trim())}${rest ? '?' + rest : ''}` }
  })
}

const absolute = (base, path) => new URL(path, `${String(base).replace(/\/?$/, '/')}`).toString()

/**
 * The pages of a built site, from the write's record (`{ids}`: `menuItem:<menu>:<page>`, `article:<item>`,
 * `contact:...`) and the doors (to read each record's address).
 * @param {{base: string, record: {ids: Record<string, number>}, doors: {get: Function}, order?: object}} input
 * @returns {Promise<Array<{pageType: string, path: string, url: string, from: string}>>}
 */
export async function sitePages({ base, record, doors, order = null, mapping = null, writePlan = null }) {
  const pages = []
  const ids = Object.entries(record?.ids ?? {})
  const menus = new Map()
  for (const [key, id] of ids) {
    const m = /^menuItem:[^:]+:(.+)$/.exec(key)
    if (!m) continue
    const item = await doors.get({ kind: 'menuItem', id })
    const path = item?.home ? 'index.php' : `index.php?Itemid=${id}`
    menus.set(m[1], { id, item })
    // The view the menu item opens (`view=article`): what a page at `Itemid` shows, for the kit's kept literals.
    const view = /[?&]view=([a-z0-9_]+)/i.exec(String(item?.link ?? ''))?.[1] ?? null
    pages.push({ pageType: m[1], path, url: absolute(base, path), from: key, ...(view ? { view } : {}) })
  }
  // An article reached under the menu item of the page whose list shows it (its category list).
  const listPage = new Map()
  for (const page of order?.pages ?? [])
    for (const b of page.blocks ?? [])
      for (const item of b.items ?? []) {
        const id = item.id ?? item
        // The home page shows items of many lists: an article is reached under its own list page when it has one.
        if (!listPage.has(id) || menus.get(listPage.get(id))?.item?.home) listPage.set(id, page.id)
      }
  // A detail page type with no menu item of its own (a class page) is the article the plan writes its blocks into:
  // that article is read under the page's name, so the page's fields are judged where they print.
  const detailOf = new Map()
  for (const page of order?.pages ?? []) {
    if (menus.has(page.id)) continue
    const op = (writePlan?.ops ?? []).find(
      (o) =>
        o.kind === 'article.create' &&
        !detailOf.has(o.key.slice('article:'.length)) &&
        (o.values ?? []).some((v) => String(v.entry ?? '').split('.')[0] === page.id)
    )
    if (op) detailOf.set(op.key.slice('article:'.length), page.id)
  }
  for (const [key, id] of ids) {
    const m = /^article:(.+)$/.exec(key)
    if (!m) continue
    const article = await doors.get({ kind: 'article', id })
    const under = menus.get(listPage.get(m[1]) ?? '') ?? [...menus.values()].find((x) => !x.item?.home)
    const path = `index.php?option=com_content&view=article&id=${id}&catid=${article?.catid ?? ''}${
      under ? `&Itemid=${under.id}` : ''
    }`
    pages.push({
      pageType: detailOf.get(m[1]) ?? `article:${m[1]}`,
      path,
      url: absolute(base, path),
      from: key
    })
  }
  // A contact a menu item opens is read at that item (its page above); read again at its raw address it would take
  // the active page's title and double the contact page.
  const opened = new Set()
  for (const { item } of menus.values()) {
    const c = /[?&]option=com_contact&view=contact&id=(\d+)/.exec(String(item?.link ?? ''))
    if (c) opened.add(Number(c[1]))
  }
  for (const [key, id] of ids)
    if (key.startsWith('contact:') && !opened.has(Number(id))) {
      const path = `index.php?option=com_contact&view=contact&id=${id}`
      pages.push({ pageType: 'contact-record', path, url: absolute(base, path), from: key })
    }
  for (const s of systemPagesOf(mapping)) pages.push({ ...s, url: absolute(base, s.path), from: 'system' })
  return pages
}
