/**
 * The WordPress half of REL-2: a release's main menu, read from its SQL dump as a tree and handed to
 * the page rule.
 *
 * Every theme is a block theme that registers no nav menu: the main menu is the navigation block of
 * the `header` template part (the database copy when the part was edited, else the theme's
 * `parts/header.html`) and its `ref` `wp_navigation` post. Without a ref, a navigation that carries
 * its own links (JA Kinetic) is the menu; else the one named `nav.<slug>` (Tracy Business: nav.tracy).
 * A page's id is its path as `get_page_uri()` builds it; home is option `page_on_front`.
 *
 * Ported from `tracy-dev site-pages` (`lib/site-pages-sql.mjs`, `wordpressIndex`).
 */
import { readTables, tableEndingWith } from '../readers/sql-dump.js'
import { blockTree, blocksOf } from './wordpress-blocks.js'
import { pagesFromMenu, plainText, utilityName } from './page-rule.js'

const PRIMARY_NAMES = ['nav.mainmenu', 'nav.tracy', 'nav.primary', 'nav.main']
const LINK_BLOCKS = new Set(['core/navigation-link', 'core/navigation-submenu', 'core/home-link'])

/** @param {string} sql the demo database dump */
export function wordpressMenu(sql) {
  const tables = readTables(sql, (n) => /(posts|options)$/.test(n))
  const posts = tableEndingWith(tables, 'posts')?.rows ?? []
  const options = tableEndingWith(tables, 'options')?.rows ?? []
  const option = (/** @type {string} */ k) => options.find((o) => o.option_name === k)?.option_value
  const pages = posts.filter((p) => p.post_type === 'page' && p.post_status === 'publish')
  const byId = new Map(pages.map((p) => [String(p.ID), p]))
  // A parent of any status counts, as in WordPress. Two pages may share a slug, never a path.
  const anyPage = new Map(posts.filter((p) => p.post_type === 'page').map((p) => [String(p.ID), p]))
  /** @returns {string} */
  const pathOf = (/** @type {Record<string, any>} */ p, depth = 0) => {
    const parent = Number(p.post_parent) ? anyPage.get(String(p.post_parent)) : undefined
    return `${parent && depth < 20 ? `${pathOf(parent, depth + 1)}/` : ''}${p.post_name}`
  }
  const front = option('show_on_front') === 'page' ? byId.get(String(option('page_on_front'))) : undefined
  const byPath = new Map(pages.map((p) => [pathOf(p).toLowerCase(), p]))
  const pageOfUrl = (/** @type {unknown} */ url) => {
    if (!url || /^(#|mailto:|tel:)/.test(String(url))) return null
    let path = String(url)
      .replace(/^[a-z]+:\/\/[^/]+/i, '')
      .replace(/[?#].*$/, '')
      .replace(/^\/+|\/+$/g, '')
    try {
      path = decodeURI(path)
    } catch {
      // Keep the raw path.
    }
    if (path === '') return front ?? null
    return byPath.get(path.toLowerCase()) ?? byPath.get(encodeURI(path).toLowerCase()) ?? null
  }
  const headerParts = posts.filter(
    (p) => p.post_type === 'wp_template_part' && p.post_name === 'header' && p.post_status === 'publish'
  )
  const index = {
    what: 'published page path',
    home: front ? pathOf(front) : null,
    count: (/** @type {string} */ id) => pages.filter((p) => pathOf(p) === id).length
  }

  /**
   * @param {(message: string) => void} warn
   * @param {string | null} [themeHeader] the theme's parts/header.html, read when the database has
   *   no header part (see `needsThemeHeader`)
   */
  function build(warn, themeHeader = null) {
    if (!front) throw new Error('the front page is not a page (show_on_front is not "page"): no Home to lock')
    if (headerParts.length > 1)
      warn(`${headerParts.length} header parts: read the first (ID ${headerParts[0].ID})`)
    const header = headerParts[0]?.post_content ?? themeHeader
    if (header == null)
      throw new Error(
        'no published wp_template_part "header" in the database, and no theme parts/header.html'
      )
    if (!headerParts.length)
      warn(`the header part comes from the theme file ${option('stylesheet')}/parts/header.html`)
    const tokens = blocksOf(header)
    const navs = tokens.filter((x) => x.name === 'core/navigation' && !x.close)
    const nav =
      navs.find((x) => x.attrs.ref) ??
      navs.find((x) => !x.self) ??
      PRIMARY_NAMES.map((n) => navs.find((x) => x.attrs.metadata?.name === n)).find(Boolean) ??
      navs.find((x) => x.attrs.metadata?.name)
    if (!nav) throw new Error('the header has no navigation block')
    let items
    if (nav.attrs.ref) {
      const post = posts.find(
        (p) => p.post_type === 'wp_navigation' && String(p.ID) === String(nav.attrs.ref)
      )
      if (!post)
        throw new Error(
          `the header navigation refers to wp_navigation ${nav.attrs.ref}, which is not in the database`
        )
      items = blockTree(blocksOf(post.post_content))
    } else if (!nav.self) {
      const inner = []
      let depth = 0
      for (const x of tokens.slice(tokens.indexOf(nav) + 1)) {
        if (x.close && depth === 0 && x.name === 'core/navigation') break
        inner.push(x)
        depth += x.close ? -1 : x.self ? 0 : 1
      }
      warn('the header navigation has no menu reference: its own links were read and matched to pages by URL')
      items = blockTree(inner)
    } else {
      const slug = nav.attrs.metadata.name.replace(/^nav\./, '')
      const post = posts.find(
        (p) => p.post_type === 'wp_navigation' && p.post_name === slug && p.post_status === 'publish'
      )
      if (!post)
        throw new Error(
          `the header navigation is named "${nav.attrs.metadata.name}" but no wp_navigation "${slug}" is published`
        )
      items = blockTree(blocksOf(post.post_content))
    }
    /** @returns {import('./page-rule.js').MenuNode} */
    const node = (/** @type {any} */ it) => {
      const children = it.children.flatMap(nodeOrSkip)
      if (it.name === 'core/home-link')
        return { label: plainText(it.attrs.label) || 'Home', id: pathOf(front), home: true, children }
      const a = it.attrs
      const label = plainText(a.label)
      let page = null
      if (a.type === 'page' && a.id != null) {
        page = byId.get(String(a.id)) ?? null
        if (!page) warn(`"${label}" links page ${a.id}, which is not a published page: skipped`)
      } else if (a.type && a.type !== 'custom' && a.kind !== 'custom') {
        if (!children.length) warn(`"${label}" links a ${a.type}, not a page: skipped`)
      } else {
        page = pageOfUrl(a.url)
        if (!page && !children.length && !/^#?$/.test(String(a.url ?? '').trim()))
          warn(
            `"${label || '(no label)'}" is a custom link${a.url ? ` (${a.url})` : ''} that matches no page: skipped`
          )
      }
      if (!page) return { label, id: null, children }
      const id = pathOf(page)
      const utility = utilityName(label, page.post_name, id)
      return {
        label: label || plainText(page.post_title),
        id,
        home: page === front || undefined,
        utility,
        children
      }
    }
    /** @returns {import('./page-rule.js').MenuNode[]} */
    const nodeOrSkip = (/** @type {any} */ it) => {
      if (LINK_BLOCKS.has(it.name)) return [node(it)]
      if (it.name !== 'core/spacer') warn(`block ${it.name} in the menu is not a link: skipped`)
      return it.children.flatMap(nodeOrSkip)
    }
    return pagesFromMenu(
      items.flatMap(nodeOrSkip),
      { homeId: pathOf(front), homeTitle: () => plainText(front.post_title) },
      warn
    )
  }

  return {
    index,
    build,
    stylesheet: option('stylesheet') ?? null,
    needsThemeHeader: headerParts.length === 0
  }
}
