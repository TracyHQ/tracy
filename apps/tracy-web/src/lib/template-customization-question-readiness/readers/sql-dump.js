/**
 * A reader for MySQL dumps (mysqldump, `wp db export`, Joomla's `installation/sql/mysql/*.sql`): the
 * column list of each CREATE TABLE and the rows of each INSERT/REPLACE, with no database.
 *
 * It is enough to READ a quickstart's demo content on any machine, which is what every static rule of
 * the Template Customization Question Readiness check needs (WordPress `wp_posts`, `wp_postmeta`,
 * `wp_options`, `wp_terms`; Joomla `#__menu`, `#__modules`…). It applies the UPDATEs a release appends to
 * its demo data (plain `SET col = literal WHERE col = literal`; a release builder's repairs are written this
 * way, and the installed site has them, so the dump must read the same). A table emptied again (DROP, TRUNCATE, or a bare DELETE FROM, as Joomla's `custom.sql` does after
 * `base.sql`) starts over, so the last rows written win. Node built-ins only.
 *
 * Ported from the `tracy-dev site-pages` tool (TracyHQ/tracy-template-dev, `lib/sql-dump.mjs`), which
 * writes `tracy_site_pages.json`: the check must read a dump exactly as the file's writer did.
 */

const ESCAPES = /** @type {Record<string, string>} */ ({
  0: '\0',
  b: '\b',
  n: '\n',
  r: '\r',
  t: '\t',
  Z: '\x1a'
})

/**
 * The statements of a dump, honouring quotes, backticks and comments between statements.
 * @param {string} sql
 */
function* statements(sql) {
  const n = sql.length
  let i = 0
  while (i < n) {
    while (i < n) {
      const c = sql[i]
      if (c === ' ' || c === '\n' || c === '\r' || c === '\t' || c === ';') i += 1
      else if ((c === '-' && sql[i + 1] === '-') || c === '#') {
        const end = sql.indexOf('\n', i)
        i = end < 0 ? n : end + 1
      } else if (c === '/' && sql[i + 1] === '*') {
        const end = sql.indexOf('*/', i + 2)
        i = end < 0 ? n : end + 2
      } else break
    }
    if (i >= n) return
    const start = i
    let quote = null
    for (; i < n; i += 1) {
      const c = sql[i]
      if (quote) {
        if (c === '\\' && quote !== '`') i += 1
        else if (c === quote) {
          if (sql[i + 1] === quote) i += 1
          else quote = null
        }
      } else if (c === "'" || c === '"' || c === '`') quote = c
      else if (c === ';') break
    }
    yield sql.slice(start, i)
    i += 1
  }
}

/**
 * One literal at `i` (a quoted string with a charset introducer allowed, NULL, 0x hex, a number, or a
 * bare word up to the next `,` or `)`), and where it ends.
 * @param {string} s @param {number} from
 * @returns {{ value: string | number | null, end: number }}
 */
function literalAt(s, from) {
  const n = s.length
  let i = from
  // A charset introducer (`_binary'…'`, `_utf8mb4'…'`) before a string.
  if (s[i] === '_' && /^_[a-z0-9]+\s*'/.test(s.slice(i, i + 24))) i = s.indexOf("'", i)
  if (s[i] === "'" || s[i] === '"') {
    const quote = s[i]
    i += 1
    let out = ''
    let segment = i
    while (i < n) {
      const c = s[i]
      if (c === '\\') {
        out += s.slice(segment, i) + (ESCAPES[s[i + 1]] ?? s[i + 1])
        i += 2
        segment = i
      } else if (c === quote && s[i + 1] === quote) {
        out += s.slice(segment, i + 1)
        i += 2
        segment = i
      } else if (c === quote) {
        out += s.slice(segment, i)
        i += 1
        break
      } else i += 1
    }
    return { value: out, end: i }
  }
  let j = i
  while (j < n && s[j] !== ',' && s[j] !== ')' && !/\s/.test(s[j])) j += 1
  const raw = s.slice(i, j).trim()
  let value
  if (/^null$/i.test(raw)) value = null
  else if (/^0x[0-9a-f]*$/i.test(raw)) value = Buffer.from(raw.slice(2), 'hex').toString('utf8')
  else if (/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(raw)) value = Number(raw)
  else value = raw
  return { value, end: j }
}

/**
 * The tuples of a VALUES list, each as an array of string | number | null.
 * @param {string} s the statement
 * @param {number} from where the first tuple starts
 */
function tuples(s, from) {
  const rows = []
  const n = s.length
  let i = from
  for (;;) {
    while (i < n && (s[i] === ',' || /\s/.test(s[i]))) i += 1
    if (i >= n || s[i] !== '(') break
    i += 1
    const row = []
    while (i < n) {
      while (i < n && /\s/.test(s[i])) i += 1
      if (s[i] === ')') {
        i += 1
        break
      }
      if (s[i] === ',') {
        i += 1
        continue
      }
      const { value, end } = literalAt(s, i)
      row.push(value)
      i = end
    }
    rows.push(row)
  }
  return rows
}

/**
 * The parts of `UPDATE t SET a = 1, b = 'x' WHERE k = 5 [AND k2 = 'y']` that a dump can carry, or null
 * for any other shape (an expression, a function call, an OR, a subquery): those are not applied.
 * @param {string} s the statement
 * @param {number} from just after `SET`
 * @returns {{ set: Record<string, any>, where: [string, any][] } | null}
 */
function updateParts(s, from) {
  const n = s.length
  let i = from
  const skip = () => {
    while (i < n && /\s/.test(s[i])) i += 1
  }
  const pair = () => {
    skip()
    const column = /^`([^`]+)`|^([A-Za-z_][\w]*)/.exec(s.slice(i))
    if (!column) return null
    i += column[0].length
    skip()
    if (s[i] !== '=') return null
    i += 1
    skip()
    const { value, end } = literalAt(s, i)
    i = end
    skip()
    // A literal followed by an operator is an expression (`n + 1`), not a value.
    if (i < n && !/^(,|WHERE\b|AND\b)/i.test(s.slice(i))) return null
    return /** @type {[string, any]} */ ([column[1] ?? column[2], value])
  }
  /** @type {Record<string, any>} */
  const set = {}
  for (;;) {
    const kv = pair()
    if (!kv) return null
    set[kv[0]] = kv[1]
    if (s[i] === ',') {
      i += 1
      continue
    }
    break
  }
  /** @type {[string, any][]} */
  const where = []
  if (/^WHERE\b/i.test(s.slice(i))) {
    i += 5
    for (;;) {
      const kv = pair()
      if (!kv) return null
      where.push(kv)
      if (/^AND\b/i.test(s.slice(i))) {
        i += 3
        continue
      }
      break
    }
  }
  return i >= n ? { set, where } : null
}

const nameOf = (/** @type {string} */ s) => s.replace(/^[`"]|[`"]$/g, '')

const RESET =
  /^(?:DROP TABLE\s+(?:IF EXISTS\s+)?|TRUNCATE\s+(?:TABLE\s+)?|DELETE\s+FROM\s+)([`"]?[^\s`";]+[`"]?)\s*$/i
const CREATE = /^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?([`"]?[^\s`"(]+[`"]?)\s*\(/i
const UPDATE = /^UPDATE\s+(?:LOW_PRIORITY\s+)?(?:IGNORE\s+)?([`"]?[^\s`"(]+[`"]?)\s+SET\s+/i
const INSERT =
  /^(?:INSERT|REPLACE)\s+(?:IGNORE\s+)?INTO\s+([`"]?[^\s`"(]+[`"]?)\s*(\(([^)]*)\))?\s*VALUES\s*/i

/**
 * @typedef {{ columns: string[] | null, rows: Record<string, any>[] }} Table
 */

/**
 * The tables of a dump, rows as objects keyed by column name.
 * @param {string} sql the dump text
 * @param {(table: string) => boolean} [want] which tables to keep, by full name (prefix included)
 * @returns {Map<string, Table>}
 */
export function readTables(sql, want = () => true) {
  /** @type {Map<string, Table>} */
  const tables = new Map()
  const tableOf = (/** @type {string} */ name) => {
    if (!tables.has(name)) tables.set(name, { columns: null, rows: [] })
    return /** @type {Table} */ (tables.get(name))
  }
  for (const statement of statements(sql)) {
    const reset = RESET.exec(statement)
    if (reset) {
      const table = tables.get(nameOf(reset[1]))
      if (table) table.rows = []
      continue
    }
    const create = CREATE.exec(statement)
    if (create) {
      const name = nameOf(create[1])
      if (!want(name)) continue
      const columns = []
      for (const line of statement.slice(create[0].length).split('\n')) {
        const column = /^\s*`([^`]+)`\s+\w/.exec(line)
        if (column) columns.push(column[1])
      }
      tableOf(name).columns = columns
      continue
    }
    const update = UPDATE.exec(statement)
    if (update) {
      // A release may append UPDATEs to its demo data (the Joomla quickstart builder does); MySQL applies
      // them, so the dump read here must too. Plain `col = literal` sets and `WHERE col = literal [AND …]` only.
      const table = tables.get(nameOf(update[1]))
      const parts = table && updateParts(statement, update[0].length)
      if (parts)
        for (const row of table.rows)
          if (parts.where.every(([c, v]) => String(row[c]) === String(v))) Object.assign(row, parts.set)
      continue
    }
    const insert = INSERT.exec(statement)
    if (!insert) continue
    const name = nameOf(insert[1])
    if (!want(name)) continue
    const table = tableOf(name)
    const columns = insert[3] ? insert[3].split(',').map((c) => nameOf(c.trim())) : table.columns
    if (!columns) throw new Error(`${name}: INSERT without a column list and no CREATE TABLE before it`)
    for (const row of tuples(statement, insert[0].length))
      table.rows.push(Object.fromEntries(columns.map((c, k) => [c, row[k]])))
  }
  return tables
}

/**
 * The one table whose name is `<prefix>_<suffix>` (`tr_posts`, `jd_menu`, `#__menu`), whatever the
 * prefix; null when there is none. Several candidates is a dump this reader cannot trust: it throws.
 * @param {Map<string, Table>} tables
 * @param {string} suffix
 * @returns {Table | null}
 */
export function tableEndingWith(tables, suffix) {
  const hits = [...tables.keys()].filter(
    (k) => k.endsWith(suffix) && /^[a-z0-9]*_?$|^#__$/i.test(k.slice(0, -suffix.length))
  )
  if (hits.length > 1) throw new Error(`several tables end with ${suffix}: ${hits.join(', ')}`)
  return hits.length === 1 ? /** @type {Table} */ (tables.get(hits[0])) : null
}
