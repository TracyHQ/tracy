/**
 * Stale UCM copies of articles, resynced in the database a release cuts.
 *
 * Joomla keeps a copy of every tagged article in `<prefix>ucm_content` (core_title, core_alias,
 * core_state, core_body...), written by the article's own save (Joomla\CMS\UCM\UCMContent through
 * Joomla\CMS\Table\CoreContent). Core views read that copy instead of the article: com_tags lists a
 * tag's items from it. Demo articles renamed or archived by SQL leave it behind (JA Voyara 1.0.11:
 * eight articles whose tag pages showed cards titled after one article and linking to another).
 *
 * The copy is written the way Joomla's save writes it: the `common` field mappings of the
 * `com_content.article` row in `<prefix>content_types` (core_title <- title, core_body <- introtext,
 * core_params <- attribs...), read from the dump itself. Every mapped UCM column whose value differs
 * from the article's is set to the article's raw field; core_content_item_id is the key, never
 * rewritten, and the counters a live Joomla itself lets drift from the copy (hits, ordering, version:
 * a page view or a drag in the Articles list changes the article alone) are left. A UCM row whose
 * article no longer exists is left and reported. A dump with nothing stale is returned byte for byte.
 */
import { readTable, unquote, writeTable } from './release-dump-table.mjs'

const TYPE = 'com_content.article'
const DRIFTING = new Set(['core_content_item_id', 'core_hits', 'core_ordering', 'core_version'])

/**
 * @param {string} dump the whole SQL dump (latin1 text: every byte kept)
 * @param {string} prefix the table prefix, like `jav_`
 * @returns {{ dump: string, resynced: { ucm: string, article: string, columns: string[] }[], orphans: { ucm: string, article: string }[] }}
 */
export function resyncUcmContent(dump, prefix) {
  const none = { dump, resynced: [], orphans: [] }
  const ucm = readTable(dump, `${prefix}ucm_content`)
  if (!ucm) return none
  const [typeAt, itemAt, keyAt] = ['core_type_alias', 'core_content_item_id', 'core_content_id'].map(ucm.col)
  if (typeAt < 0 || itemAt < 0 || keyAt < 0) throw new Error(`${ucm.table}: a key column is missing`)
  const copies = ucm.rows.filter((r) => unquote(r.f[typeAt]) === TYPE)
  if (!copies.length) return none

  const content = readTable(dump, `${prefix}content`)
  if (!content) throw new Error(`${ucm.table}: ${TYPE} rows but no ${prefix}content table`)
  const articles = new Map(content.rows.map((r) => [r.f[content.col('id')], r]))

  // the mapping Joomla's own save uses, from this site's content type
  const types = readTable(dump, `${prefix}content_types`)
  const typeRow = types?.rows.find((r) => unquote(r.f[types.col('type_alias')]) === TYPE)
  if (!typeRow) throw new Error(`${prefix}content_types: no ${TYPE} row to map its UCM copies by`)
  const common = JSON.parse(unquote(typeRow.f[types.col('field_mappings')])).common ?? {}
  const pairs = Object.entries(common)
    .filter(([to]) => !DRIFTING.has(to))
    .map(([to, from]) => [to, ucm.col(to), content.col(from)])
    .filter(([, to, from]) => to >= 0 && from >= 0)

  const resynced = []
  const orphans = []
  for (const r of copies) {
    const article = articles.get(r.f[itemAt])
    if (!article) {
      orphans.push({ ucm: r.f[keyAt], article: r.f[itemAt] })
      continue
    }
    const columns = []
    for (const [name, to, from] of pairs)
      if (r.f[to] !== article.f[from]) {
        r.f[to] = article.f[from]
        columns.push(name)
      }
    if (columns.length) resynced.push({ ucm: r.f[keyAt], article: r.f[itemAt], columns })
  }
  return { dump: resynced.length ? writeTable(dump, ucm) : dump, resynced, orphans }
}
