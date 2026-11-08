/**
 * The rows of one table in a mysqldump, read and written back field by field (the repairs a release cut
 * makes in the database it ships: src/release-tag-paths.mjs, release-ucm-sync.mjs, release-remove-user.mjs).
 *
 * Expects the shape every JA quickstart dump has: one row per line under
 * `INSERT INTO \`<table>\` VALUES`, a table possibly split over several such statements. A string never
 * holds a raw newline (mysqldump escapes it), so `,\n` and `;\n` only ever end a row or a statement.
 * Every byte outside the rows that changed is kept.
 */

/** Splits one `(v1,v2,...)` row into its raw field texts (quoted strings keep their quotes and escapes). */
export function fieldsOf(row) {
  const inner = row.slice(row.indexOf('(') + 1, row.lastIndexOf(')'))
  const out = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (quoted) {
      cur += c
      if (c === '\\') cur += inner[++i]
      else if (c === "'") quoted = false
    } else if (c === "'") {
      quoted = true
      cur += c
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/** The text of a raw field (NULL reads as ''). */
export const unquote = (raw) => (raw === 'NULL' ? '' : raw.replace(/^'|'$/g, '').replace(/\\(.)/g, '$1'))
/** A text as a raw SQL string field. */
export const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

/** The column names of `CREATE TABLE \`<table>\``, in order; null when the dump has no such table. */
export function columnsOf(dump, table) {
  const start = dump.indexOf(`CREATE TABLE \`${table}\` (`)
  if (start < 0) return null
  const end = dump.indexOf('\n)', start)
  return [...dump.slice(start, end).matchAll(/^\s+`([^`]+)`\s/gm)].map((m) => m[1])
}

/**
 * Every row of a table: `{ cols, col(name), rows }`, each row `{ f, drop }` where `f` holds the raw
 * fields (edit them in place) and `drop` removes the row when the table is written back. Null when the
 * dump has no CREATE TABLE for it.
 */
export function readTable(dump, table) {
  const cols = columnsOf(dump, table)
  if (!cols) return null
  const head = `INSERT INTO \`${table}\` VALUES\n`
  const statements = []
  const rows = []
  for (let at = dump.indexOf(head); at >= 0; at = dump.indexOf(head, at + 1)) {
    const bodyStart = at + head.length
    const bodyEnd = dump.indexOf(';\n', bodyStart)
    const text = dump.slice(bodyStart, bodyEnd)
    const own = text.split(',\n').map((line) => ({ f: fieldsOf(line), drop: false }))
    statements.push({ at, bodyStart, bodyEnd, text, rows: own })
    rows.push(...own)
  }
  const col = (name) => cols.indexOf(name)
  return { table, cols, col, rows, statements }
}

/** The dump with the table's rows as they are now; a statement whose rows are unchanged keeps its bytes. */
export function writeTable(dump, read) {
  if (!read) return dump
  let out = ''
  let from = 0
  for (const s of read.statements) {
    const kept = s.rows.filter((r) => !r.drop)
    const body = kept.map((r) => `(${r.f.join(',')})`).join(',\n')
    if (body === s.text) continue
    // a statement left with no row goes, with its line end
    out += kept.length ? dump.slice(from, s.bodyStart) + body : dump.slice(from, s.at)
    from = kept.length ? s.bodyEnd : s.bodyEnd + 2
  }
  return out + dump.slice(from)
}
