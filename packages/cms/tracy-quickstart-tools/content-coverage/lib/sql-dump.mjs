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
      let out = ''
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
          i++
          break
        }
        out += d
        i++
      }
      row.push(out)
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

/** @returns {{ tables: Map<string, object[]>, prefix: string }} */
export function readDump(file) {
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
  return { tables, prefix }
}
