/**
 * Archived demo articles taken out of their tags in the database a release cuts (release-joomla.mjs --untag-archived).
 *
 * Joomla's tag pages list an article that is archived (state 2) as well as a published one, but a quickstart
 * contract captures only published articles: the Claude Cowork plugin projects state 1 as the public content.
 * An archived demo article that keeps its tags is then printed on a tag page a visitor reaches, with words the
 * customer can neither edit nor remove through Tracy (JA Voyara 1.0.12: 13 archived posts, one on the street-food
 * tag page). Their rows of the tag map go; the article itself stays, still on the archive view.
 */
import { readTable, unquote, writeTable } from './release-dump-table.mjs'

/**
 * @param {string} dump the whole SQL dump (latin1 text: every byte kept)
 * @param {string} prefix the table prefix, like `jav_`
 * @returns {{ dump: string, untagged: { article: string, rows: number }[] }}
 */
export function untagArchived(dump, prefix) {
  const content = readTable(dump, `${prefix}content`)
  const map = readTable(dump, `${prefix}contentitem_tag_map`)
  if (!content || !map) return { dump, untagged: [] }
  const archived = new Set(
    content.rows
      .filter((r) => unquote(r.f[content.col('state')]) === '2')
      .map((r) => unquote(r.f[content.col('id')]))
  )
  const alias = map.col('type_alias')
  const item = map.col('content_item_id')
  const count = new Map()
  for (const r of map.rows) {
    const id = unquote(r.f[item])
    if (unquote(r.f[alias]) !== 'com_content.article' || !archived.has(id)) continue
    r.drop = true
    count.set(id, (count.get(id) ?? 0) + 1)
  }
  if (!count.size) return { dump, untagged: [] }
  const untagged = [...count].map(([article, rows]) => ({ article, rows }))
  return { dump: writeTable(dump, map), untagged }
}
