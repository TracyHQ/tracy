/**
 * The demo database of a Joomla or WordPress release as tables, parsed once per context and shared
 * by the rules that compare a contract with it (STAB-1, STAB-6, ABOUT-1, ABOUT-3, STAB-7, SHARE-1,
 * HIDDEN-1).
 *
 * `demoDatabase(context)` throws `UnreadableContent` (from `release-content.js`) when the release
 * carries no dump this check can read; a rule turns its `status` into its own.
 */
import { readTables, tableEndingWith } from './sql-dump.js'

/**
 * @typedef {{
 *   table: (suffix: string) => Record<string, any>[],
 *   option: (name: string) => string | undefined
 * }} DemoDatabase
 */

/** @type {WeakMap<object, Promise<DemoDatabase>>} */
const memo = new WeakMap()

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<DemoDatabase>}
 */
export function demoDatabase(context) {
  if (!memo.has(context))
    memo.set(
      context,
      context.content.sql().then((sql) => {
        const tables = readTables(sql)
        const table = (/** @type {string} */ suffix) => tableEndingWith(tables, suffix)?.rows ?? []
        const options = new Map(table('options').map((o) => [o.option_name, o.option_value]))
        return { table, option: (name) => options.get(name) ?? undefined }
      })
    )
  return /** @type {Promise<DemoDatabase>} */ (memo.get(context))
}

/** The dump table of each Joomla entity kind a content contract names. */
export const JOOMLA_TABLE_OF_KIND = /** @type {Record<string, string>} */ ({
  category: 'categories',
  module: 'modules',
  article: 'content',
  menuItem: 'menu',
  templateStyle: 'template_styles',
  // The kinds `capture-contract.py --full-coverage` adds.
  contact: 'contact_details',
  tag: 'tags',
  field: 'fields',
  user: 'users'
  // `userProfile` has no row of its own in a dump (the plugin names one by author and key): not checked here.
  // `languageString` is a line of a template language file or the override file, not a table row: not checked here.
  // `siteSetting` is a key of a T4 site profile file (etc/site/<profile>.json), not a table row: not checked here.
})

/**
 * The dump rows a contract entity's `identity` names: every identity field equal to the row's
 * column, compared as strings (a dump is text).
 * @param {DemoDatabase} db
 * @param {{ kind: string, identity: Record<string, unknown> }} entity
 * @param {Record<string, string>} tableOfKind
 */
export function rowsOfEntity(db, entity, tableOfKind) {
  const suffix = tableOfKind[entity.kind]
  if (!suffix) return null
  return db
    .table(suffix)
    .filter((row) =>
      Object.entries(entity.identity ?? {}).every(([k, v]) => String(row[k] ?? '') === String(v ?? ''))
    )
}

/**
 * The WordPress post a contract `page` entity names (post type and slug; the language is a
 * Polylang term and is not a column of `wp_posts`).
 * @param {DemoDatabase} db
 * @param {{ identity: Record<string, unknown> }} entity
 */
export function wordpressPostsOf(db, entity) {
  const { postType = 'page', slug } = /** @type {Record<string, any>} */ (entity.identity ?? {})
  return db
    .table('posts')
    .filter((p) => p.post_type === postType && p.post_name === slug && p.post_status === 'publish')
}
