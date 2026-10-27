/**
 * The WordPress demo as the PAGE rules read it, built once per check from the demo tables:
 *
 *   const wp = await wordpressDemo(context)
 *   wp.posts                // every row of `<prefix>_posts`
 *   wp.pathOf(page)         // the page's path as `get_page_uri()` builds it (`product/faq`)
 *   wp.pageById.get('42')   // a page row by ID, any status
 *   wp.languageOf('42')     // its Polylang language slug, or null on a site without Polylang
 *   wp.isSource(row)        // true for a row of the source edition (or of a one-language site)
 *   wp.postsPage / wp.front // `page_for_posts` / `page_on_front` page rows, or null
 *   wp.overridden           // theme files the database overrides (`templates/404.html`, `parts/footer.html`)
 *
 * The source edition is the contract's `editions.json` `source.language`, else the language of
 * the front page.
 */
import { demoTables } from './demo-tables.js'
import { releaseContract } from './contract-profile-of-release.js'

/** @type {WeakMap<object, Promise<any>>} */
const memo = new WeakMap()

/** @param {import('../index.js').RuleContext} context */
async function build(context) {
  const t = await demoTables(context)
  const posts = t.rows('posts')
  const pageById = new Map(posts.filter((p) => p.post_type === 'page').map((p) => [String(p.ID), p]))
  /** @returns {string} */
  const pathOf = (/** @type {Record<string, any>} */ p, depth = 0) => {
    const parent = Number(p.post_parent) ? pageById.get(String(p.post_parent)) : undefined
    return `${parent && depth < 20 ? `${pathOf(parent, depth + 1)}/` : ''}${p.post_name}`
  }
  const languageTerm = new Map(
    t
      .rows('term_taxonomy')
      .filter((r) => r.taxonomy === 'language')
      .map((r) => [String(r.term_taxonomy_id), String(r.term_id)])
  )
  const slugOf = new Map(t.rows('terms').map((r) => [String(r.term_id), String(r.slug).toLowerCase()]))
  /** @type {Map<string, string>} */
  const languages = new Map()
  for (const r of t.rows('term_relationships')) {
    const term = languageTerm.get(String(r.term_taxonomy_id))
    if (term) languages.set(String(r.object_id), slugOf.get(term) ?? '')
  }
  const languageOf = (/** @type {unknown} */ id) => languages.get(String(id)) ?? null
  const front = pageById.get(String(t.option('page_on_front') ?? '')) ?? null
  const postsPage = pageById.get(String(t.option('page_for_posts') ?? '')) ?? null
  const source =
    releaseContract(context)?.json('editions.json')?.source?.language ?? (front ? languageOf(front.ID) : null)
  const isSource = (/** @type {Record<string, any>} */ row) => {
    const language = languageOf(row.ID)
    return !language || !source || language === source
  }
  // Theme files the database overrides (an edited template or part): not what the site shows.
  const overridden = new Set(
    posts
      .filter((p) => p.post_status === 'publish' && ['wp_template', 'wp_template_part'].includes(p.post_type))
      .map((p) => `${p.post_type === 'wp_template' ? 'templates' : 'parts'}/${p.post_name}.html`)
  )
  return { tables: t, posts, pageById, pathOf, languageOf, isSource, front, postsPage, source, overridden }
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<Awaited<ReturnType<typeof build>>>}
 */
export function wordpressDemo(context) {
  if (!memo.has(context)) memo.set(context, build(context))
  return /** @type {Promise<any>} */ (memo.get(context))
}
