// The Joomla T4 adapter of the gate's renderer (ticket #585): how a page of a built site is addressed, how its theme
// side is picked, and which pages a built site has. Takes the site as input: nothing here names a template.
//   theme   `?theme=dark|light` picks the side for one load and is never saved (the template's own script reads it)
//   pages   every menu item the write created, every article it created reached under the list page that holds it
//           (a block printed only under its list page's menu item, door measurements), and the system pages
//           (product decision 2): search, a missing page, sign in, password reset, username reminder, the contact form
//           when a contact exists.

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

const absolute = (base, path) => new URL(path, `${String(base).replace(/\/?$/, '/')}`).toString()

/**
 * The pages of a built site, from the write's record (`{ids}`: `menuItem:<menu>:<page>`, `article:<item>`,
 * `contact:...`) and the doors (to read each record's address).
 * @param {{base: string, record: {ids: Record<string, number>}, doors: {get: Function}, order?: object}} input
 * @returns {Promise<Array<{pageType: string, path: string, url: string, from: string}>>}
 */
export async function sitePages({ base, record, doors, order = null }) {
  const pages = []
  const ids = Object.entries(record?.ids ?? {})
  const menus = new Map()
  for (const [key, id] of ids) {
    const m = /^menuItem:[^:]+:(.+)$/.exec(key)
    if (!m) continue
    const item = await doors.get({ kind: 'menuItem', id })
    const path = item?.home ? 'index.php' : `index.php?Itemid=${id}`
    menus.set(m[1], { id, item })
    pages.push({ pageType: m[1], path, url: absolute(base, path), from: key })
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
  for (const [key, id] of ids) {
    const m = /^article:(.+)$/.exec(key)
    if (!m) continue
    const article = await doors.get({ kind: 'article', id })
    const under = menus.get(listPage.get(m[1]) ?? '') ?? [...menus.values()].find((x) => !x.item?.home)
    const path = `index.php?option=com_content&view=article&id=${id}&catid=${article?.catid ?? ''}${
      under ? `&Itemid=${under.id}` : ''
    }`
    pages.push({ pageType: `article:${m[1]}`, path, url: absolute(base, path), from: key })
  }
  for (const [key, id] of ids)
    if (key.startsWith('contact:')) {
      const path = `index.php?option=com_contact&view=contact&id=${id}`
      pages.push({ pageType: 'contact-record', path, url: absolute(base, path), from: key })
    }
  for (const s of SYSTEM_PAGES) pages.push({ ...s, url: absolute(base, s.path), from: 'system' })
  return pages
}
