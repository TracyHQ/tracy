/**
 * Tags saved without a path, repaired in the database a release cuts.
 *
 * Joomla's Tags screen writes a tag's `path` (its parent's path, a slash, its alias) and its place in
 * the nested set. Demo tags inserted by SQL can skip both (JA Voyara 1.0.11: five tags with path ''
 * and lft/rgt overlapping their siblings). Every such tag then has the same identity {path: ""}: the
 * contract capture stops on it (K7, one identity matching several rows) and the Claude Cowork plugin,
 * which binds a tag by its path, could find none of them.
 *
 * Only a tag whose path is empty is given one. When any is, the nested set (lft, rgt, level) is
 * rebuilt the way Joomla's Rebuild does it: depth first from the root, siblings in their old lft
 * order (then by id). A dump whose tags all have a path is returned byte for byte; a repaired path
 * another tag already holds stops the cut.
 *
 * Expects a mysqldump with one row per line under `INSERT INTO \`<prefix>tags\` VALUES`, the shape
 * every JA quickstart dump has; the rows are rewritten field by field, every other byte kept.
 */

import { columnsOf, fieldsOf, quote, unquote } from './release-dump-table.mjs'

/**
 * @param {string} dump the whole SQL dump (latin1 text: every byte kept)
 * @param {string} prefix the table prefix, like `jav_`
 * @returns {{ dump: string, repaired: { id: string, path: string }[] }}
 */
export function repairTagPaths(dump, prefix) {
  const table = `${prefix}tags`
  const cols = columnsOf(dump, table)
  const head = `INSERT INTO \`${table}\` VALUES\n`
  const at = dump.indexOf(head)
  if (!cols || at < 0) return { dump, repaired: [] }
  const idx = Object.fromEntries(
    ['id', 'parent_id', 'lft', 'rgt', 'level', 'path', 'alias'].map((c) => [c, cols.indexOf(c)])
  )
  if (Object.values(idx).some((i) => i < 0))
    throw new Error(`${table}: a column of the nested set is missing`)

  const bodyStart = at + head.length
  const bodyEnd = dump.indexOf(';\n', bodyStart)
  const lines = dump.slice(bodyStart, bodyEnd).split(',\n')
  const rows = lines.map((line) => {
    const f = fieldsOf(line)
    return {
      f,
      id: f[idx.id],
      parent: f[idx.parent_id],
      lft: Number(f[idx.lft]),
      path: unquote(f[idx.path]),
      alias: unquote(f[idx.alias])
    }
  })
  const byId = new Map(rows.map((r) => [r.id, r]))
  const root = rows.find((r) => r.parent === '0')
  const empty = rows.filter((r) => r !== root && r.path === '')
  if (!empty.length || !root) return { dump, repaired: [] }

  // paths: a parent before its children, so a child under a repaired tag reads the new parent path
  const repaired = []
  const pathOf = (r) => {
    if (r === root || r.path !== '') return r.path
    const parent = byId.get(r.parent)
    if (!parent) throw new Error(`${table}: tag ${r.id} has no parent ${r.parent}`)
    const up = pathOf(parent)
    r.path = up ? `${up}/${r.alias}` : r.alias
    repaired.push({ id: r.id, path: r.path })
    return r.path
  }
  for (const r of empty) pathOf(r)
  for (const r of repaired) {
    const other = rows.find((o) => o.id !== r.id && o.path === r.path)
    if (other)
      throw new Error(`${table}: tag ${r.id} would take the path "${r.path}" that tag ${other.id} holds`)
  }
  repaired.sort((a, b) => Number(a.id) - Number(b.id))

  // nested set, depth first from the root
  const kids = new Map()
  for (const r of rows) if (r !== root) kids.set(r.parent, [...(kids.get(r.parent) ?? []), r])
  let n = 0
  const walk = (r, level) => {
    r.f[idx.lft] = String(n++)
    r.f[idx.level] = String(level)
    for (const k of (kids.get(r.id) ?? []).sort((a, b) => a.lft - b.lft || Number(a.id) - Number(b.id)))
      walk(k, level + 1)
    r.f[idx.rgt] = String(n++)
  }
  walk(root, 0)
  for (const r of repaired) byId.get(r.id).f[idx.path] = quote(r.path)

  const body = rows.map((r) => `(${r.f.join(',')})`).join(',\n')
  return { dump: dump.slice(0, bodyStart) + body + dump.slice(bodyEnd), repaired }
}
