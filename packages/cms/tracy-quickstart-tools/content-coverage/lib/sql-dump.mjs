// Minimal reader for a mysqldump/mariadb-dump file: table -> rows (objects keyed by column).
// Handles extended INSERTs, quoted strings with backslash escapes, NULL and bare numbers.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const ESC = { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a', b: '\b' }

function parseColumns(sql) {
  const cols = new Map()
  for (const m of sql.matchAll(/CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\)[^;]*;/g)) {
    const names = []
    for (const line of m[2].split('\n')) {
      const c = line.match(/^\s*`([^`]+)`\s/)
      if (c) names.push(c[1])
    }
    cols.set(m[1], names)
  }
  return cols
}

/** The quoted string literal that starts at index i (on its quote); returns [value, index after it]. */
function readString(s, i) {
  let out = ''
  const n = s.length
  i++
  while (i < n) {
    const d = s[i]
    if (d === '\\') {
      const e = s[i + 1]
      out += ESC[e] ?? e
      i += 2
      continue
    }
    if (d === "'") {
      if (s[i + 1] === "'") {
        out += "'"
        i += 2
        continue
      }
      return [out, i + 1]
    }
    out += d
    i++
  }
  return [out, i]
}

/** Parse the tuple list that follows `VALUES` starting at index i; returns [rows, endIndex]. */
function parseTuples(s, i) {
  const rows = []
  let row = null
  let n = s.length
  while (i < n) {
    const c = s[i]
    if (c === '(') {
      row = []
      i++
      continue
    }
    if (c === ')') {
      rows.push(row)
      row = null
      i++
      continue
    }
    if (c === ';' && row === null) return [rows, i + 1]
    if (c === ',' || c === ' ' || c === '\n' || c === '\r' || c === '\t') {
      i++
      continue
    }
    if (c === "'") {
      const [out, end] = readString(s, i)
      row.push(out)
      i = end
      continue
    }
    // Bare token: NULL, number, or hex/binary literal.
    let j = i
    while (j < n && s[j] !== ',' && s[j] !== ')') j++
    const tok = s.slice(i, j).trim()
    row.push(tok === 'NULL' ? null : tok)
    i = j
  }
  return [rows, i]
}

// A value of an UPDATE or a WHERE: a quoted string, NULL or a bare token.
function readValue(s, i) {
  if (s[i] === "'") return readString(s, i)
  const m = /^(NULL|-?[0-9.]+)/i.exec(s.slice(i, i + 40))
  if (!m) return [undefined, i]
  return [m[1].toUpperCase() === 'NULL' ? null : m[1], i + m[1].length]
}

// `\`col\` = <value>` pairs joined by `sep` from index i; stops at the first thing that is not one. Returns [pairs, end].
function readPairs(s, i, sep) {
  const pairs = []
  for (;;) {
    const m = /^\s*`([^`]+)`\s*(=|IN)\s*/i.exec(s.slice(i, i + 200))
    if (!m) return [pairs, i]
    i += m[0].length
    if (m[2].toUpperCase() === 'IN') {
      const list = /^\(([^()]*)\)/.exec(s.slice(i))
      if (!list) return [pairs, i]
      pairs.push([m[1], list[1].split(',').map((v) => v.trim().replace(/^'(.*)'$/, '$1'))])
      i += list[0].length
    } else {
      const [value, end] = readValue(s, i)
      if (value === undefined) return [pairs, i]
      pairs.push([m[1], value])
      i = end
    }
    const next = new RegExp(`^\\s*${sep}\\s*`, 'i').exec(s.slice(i, i + 10))
    if (!next) return [pairs, i]
    i += next[0].length
  }
}

const matches = (row, where) =>
  where.every(([col, want]) =>
    Array.isArray(want)
      ? want.includes(String(row[col]))
      : String(row[col] ?? 'NULL') === String(want ?? 'NULL')
  )

/**
 * Apply the dump's single-table `UPDATE ... SET ... WHERE ...` and `DELETE FROM ... WHERE ...` statements whose WHERE is
 * `col = value` (or `col IN (...)`) joined by AND, in order, to the rows read from its INSERTs: a quickstart installer
 * appends demo data fixes that way (JA Boxing 1.0.10: a module's params rewritten after its INSERT). Returns how many
 * statements were applied and the ones skipped because their shape is not one of these.
 */
function applyChanges(sql, tables) {
  const re = /(?:^|\n)(UPDATE|DELETE FROM) `([^`]+)`\s+/g
  let applied = 0
  const skipped = []
  let m
  while ((m = re.exec(sql))) {
    let i = re.lastIndex
    let set = []
    if (m[1] === 'UPDATE') {
      if (!/^SET\s/i.test(sql.slice(i, i + 4))) {
        skipped.push(`${m[1]} ${m[2]}`)
        continue
      }
      ;[set, i] = readPairs(sql, i + 4, ',')
    }
    const w = /^\s*WHERE\s+/i.exec(sql.slice(i, i + 20))
    const [where, end] = w ? readPairs(sql, i + w[0].length, 'AND') : [[], i]
    if (!w || !where.length || !/^\s*;/.test(sql.slice(end, end + 5)) || (m[1] === 'UPDATE' && !set.length)) {
      skipped.push(`${m[1]} ${m[2]}`)
      continue
    }
    re.lastIndex = end
    const rows = tables.get(m[2]) ?? []
    if (m[1] === 'UPDATE') {
      for (const row of rows) if (matches(row, where)) for (const [col, v] of set) row[col] = v
    } else
      tables.set(
        m[2],
        rows.filter((row) => !matches(row, where))
      )
    applied++
  }
  return { applied, skipped }
}

/**
 * @param {string} file
 * @param {{ changes?: boolean }} [o] `changes`: also apply the UPDATE and DELETE statements after the INSERTs (applyChanges)
 * @returns {{ tables: Map<string, object[]>, prefix: string, changes?: { applied: number, skipped: string[] } }}
 */
export function readDump(file, o = {}) {
  let buf = readFileSync(file)
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf)
  const sql = buf.toString('utf8')
  const columns = parseColumns(sql)
  const tables = new Map()
  const re = /INSERT INTO `([^`]+)`(?: \(([^)]*)\))? VALUES\s*/g
  let m
  while ((m = re.exec(sql))) {
    const name = m[1]
    const cols = m[2] ? m[2].split(',').map((x) => x.trim().replace(/`/g, '')) : (columns.get(name) ?? [])
    const [rows, end] = parseTuples(sql, re.lastIndex)
    re.lastIndex = end
    const list = tables.get(name) ?? []
    for (const r of rows) list.push(Object.fromEntries(r.map((v, k) => [cols[k] ?? `col${k}`, v])))
    tables.set(name, list)
  }
  // Joomla prefix: the one that has a `<prefix>content` table; WordPress: the one that has `<prefix>posts` and `<prefix>options`.
  const contentTable =
    [...columns.keys()].find((t) => /^[a-z0-9]+_content$/i.test(t)) ??
    [...columns.keys()].find(
      (t) => /^[a-z0-9]+_posts$/i.test(t) && columns.has(t.replace(/posts$/, 'options'))
    )
  const prefix = contentTable ? contentTable.replace(/(content|posts)$/, '') : ''
  return { tables, prefix, ...(o.changes ? { changes: applyChanges(sql, tables) } : {}) }
}
