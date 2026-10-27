/**
 * Menu items of a release's demo that open a blog category, judged against the category's title (ABOUT-2, categories;
 * final decisions of 12/10/2026). FULL renames the categories for the customer's trade, so an item that names its
 * category must carry exactly the category's title: then the item and the category are recognisably one name. An
 * item that names it by another label sharing a word ("Design news" for "Design") is a `problem`: Tracy cannot tell it
 * names the category, and the demo's word stays (g65 JA Essence Joomla FULL footer kept "Health", "Design").
 * An item sharing no word with the title (a "Category Style 2" layout sample, a "Blog" heading) names no category
 * and is `unrelated`, listed only.
 *
 *   const { problems, unrelated } = await categoryMenuLabels(context)
 *
 * - Joomla: every published site menu item (any menu) whose link, or the link of the item an alias item points
 *   at (`aliasoptions`), is `option=com_content&view=category&...&id=N`, against `#__categories` N.
 * - WordPress: `core/navigation-link` and `core/navigation-submenu` blocks of published posts with
 *   `kind: "taxonomy", type: "category"`, and classic `nav_menu_item` posts whose `_menu_item_object` is `category`
 *   and whose own title is set (an empty title shows the term's name, which follows a rename). A link to a PAGE that
 *   lists a category (JA Essence WordPress "Health" → /category/category-style-1/) cannot be judged here: which
 *   category the page lists sits in its query block, and only a built site shows it (`menu-category-names`).
 * - EmDash: no blog categories, nothing to judge.
 * Errors of `context.content.sql()` (`UnreadableContent`) pass through unchanged.
 */
import { plainText } from '../site-pages/page-rule.js'
import { blocksOf } from '../site-pages/wordpress-blocks.js'
import { demoTables } from './demo-tables.js'

const words = (/** @type {string} */ s) =>
  new Set((s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter((w) => !/^\d+$/.test(w)))
const same = (/** @type {string} */ a, /** @type {string} */ b) =>
  a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * @param {{ menu: string, label: string, id: string, title: string }[]} items
 * @returns {{ problems: string[], unrelated: string[] }}
 */
function judge(items) {
  const problems = []
  const unrelated = []
  for (const { menu, label, id, title } of items) {
    if (!label || !title || same(label, title)) continue
    const line = `${menu} "${label}" → category ${id} "${title}"`
    const theirs = words(title)
    if ([...words(label)].some((w) => theirs.has(w))) problems.push(line)
    else unrelated.push(line)
  }
  return { problems, unrelated }
}

/** @param {Awaited<ReturnType<typeof demoTables>>} t */
function joomla(t) {
  const titles = new Map(
    t
      .rows('categories')
      .filter((c) => (c.extension ?? 'com_content') === 'com_content')
      .map((c) => [String(c.id), plainText(c.title)])
  )
  const rows = t.rows('menu').filter((r) => Number(r.client_id) === 0 && Number(r.published) === 1)
  const byId = new Map(rows.map((r) => [String(r.id), r]))
  const linkOf = (/** @type {Record<string, any>} */ r) => {
    if (r.type !== 'alias') return String(r.link ?? '')
    try {
      return String(byId.get(String(JSON.parse(r.params || '{}').aliasoptions))?.link ?? '')
    } catch {
      return ''
    }
  }
  const items = []
  for (const r of rows) {
    const link = linkOf(r)
    if (!/option=com_content&view=category\b/.test(link)) continue
    const id = /[?&]id=(\d+)/.exec(link)?.[1]
    if (id && titles.has(id))
      items.push({ menu: String(r.menutype), label: plainText(r.title), id, title: String(titles.get(id)) })
  }
  return items
}

/** @param {Awaited<ReturnType<typeof demoTables>>} t */
function wordpress(t) {
  const category = new Set(
    t
      .rows('term_taxonomy')
      .filter((r) => r.taxonomy === 'category')
      .map((r) => String(r.term_id))
  )
  const names = new Map(
    t
      .rows('terms')
      .filter((r) => category.has(String(r.term_id)))
      .map((r) => [String(r.term_id), plainText(r.name)])
  )
  const posts = t.rows('posts').filter((p) => p.post_status === 'publish')
  const items = []
  for (const p of posts)
    for (const b of blocksOf(p.post_content))
      if (
        /^core\/navigation-(link|submenu)$/.test(b.name) &&
        b.attrs?.kind === 'taxonomy' &&
        b.attrs?.type === 'category' &&
        names.has(String(b.attrs.id))
      )
        items.push({
          menu: String(p.post_name || p.ID),
          label: plainText(b.attrs.label ?? ''),
          id: String(b.attrs.id),
          title: String(names.get(String(b.attrs.id)))
        })
  const meta = new Map()
  for (const m of t.rows('postmeta'))
    if (/^_menu_item_(object|object_id)$/.test(String(m.meta_key)))
      meta.set(`${m.post_id} ${m.meta_key}`, String(m.meta_value))
  for (const p of posts) {
    if (p.post_type !== 'nav_menu_item' || meta.get(`${p.ID} _menu_item_object`) !== 'category') continue
    const id = meta.get(`${p.ID} _menu_item_object_id`) ?? ''
    if (names.has(id))
      items.push({ menu: 'menu', label: plainText(p.post_title ?? ''), id, title: String(names.get(id)) })
  }
  return items
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<{ problems: string[], unrelated: string[] }>}
 */
export async function categoryMenuLabels(context) {
  const { platform } = context.release
  if (platform !== 'joomla' && platform !== 'wordpress') return { problems: [], unrelated: [] }
  const t = await demoTables(context)
  return judge(platform === 'joomla' ? joomla(t) : wordpress(t))
}
