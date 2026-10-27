/**
 * The demo database of a WordPress or Joomla release as tables, parsed once per check and shared by
 * every rule that reads it (a 14 MB dump takes seconds to split, so no rule parses it on its own).
 *
 *   const t = await demoTables(context)
 *   t.rows('posts')      // rows of `<prefix>_posts`, [] when the dump has no such table
 *   t.option('stylesheet')
 *
 * Errors of `context.content.sql()` (`UnreadableContent`) pass through unchanged.
 */
import { readTables, tableEndingWith } from './sql-dump.js'

/** @type {WeakMap<object, Promise<ReturnType<typeof wrap>>>} */
const memo = new WeakMap()

/** @param {Map<string, import('./sql-dump.js').Table>} tables */
function wrap(tables) {
  /** @type {Map<string, Record<string, any>[]>} */
  const cache = new Map()
  /** @param {string} suffix the table name without its prefix: `posts`, `menu`, `term_taxonomy` */
  const rows = (suffix) => {
    if (!cache.has(suffix)) cache.set(suffix, tableEndingWith(tables, suffix)?.rows ?? [])
    return /** @type {Record<string, any>[]} */ (cache.get(suffix))
  }
  /** @param {string} name a WordPress option */
  const option = (name) => rows('options').find((o) => o.option_name === name)?.option_value
  return { rows, option }
}

/**
 * @param {import('../index.js').RuleContext} context
 * @returns {Promise<ReturnType<typeof wrap>>}
 */
export function demoTables(context) {
  if (!memo.has(context))
    memo.set(
      context,
      context.content.sql().then((sql) => wrap(readTables(sql)))
    )
  return /** @type {Promise<ReturnType<typeof wrap>>} */ (memo.get(context))
}
