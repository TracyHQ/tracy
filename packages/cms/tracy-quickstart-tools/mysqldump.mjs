/**
 * Read rows straight out of a mysqldump file — no database, no container.
 *
 * WHY: the quickstart release ships `<slug>-database-<v>.sql.gz` as its canonical database, and
 * every generated artifact (inventory, editions, demo-trim map) must come from THAT file, not
 * from a site that happened to be running. A running site drifts (the customer, WordPress cron,
 * a plugin update); the release does not. The parser understands the extended-insert form that
 * `mysqldump`/`wp db export` write (`INSERT INTO \`t\` VALUES (...),(...);`) and the escapes in
 * it. It is the same reader the Joomla editions builder carries inline
 * (`scripts/build-joomla-editions.mjs`); this copy is the one to import from now on.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

/** The whole dump as text, gunzipped when the name ends in `.gz`. */
export function readDump(file) {
  const raw = readFileSync(file)
  return (file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')
}

/** Table names that have a CREATE TABLE in the dump. */
export function tableNames(sql) {
  return [...sql.matchAll(/^CREATE TABLE `([^`]+)` \(/gm)].map((m) => m[1])
}

/** Rows of one table: the column names from CREATE TABLE, the values from every INSERT. */
export function tableRows(sql, table) {
  const create = sql.indexOf('CREATE TABLE `' + table + '` (')
  if (create === -1) throw new Error(`the dump has no table ${table}`)
  const columns = []
  for (const line of sql.slice(create, sql.indexOf(') ENGINE=', create)).split('\n').slice(1)) {
    const m = /^\s+`([^`]+)`/.exec(line)
    if (m) columns.push(m[1])
  }
  const rows = []
  // `INSERT INTO \`t\` VALUES (…)` (mysqldump) or `INSERT INTO \`t\` (\`a\`, \`b\`) VALUES (…)`
  // (wp db export / mariadb-dump --complete-insert). With a column list, that list wins over the
  // CREATE TABLE order.
  const head = 'INSERT INTO `' + table + '` '
  let at = sql.indexOf(head, create)
  while (at !== -1) {
    let i = sql.indexOf('VALUES', at)
    const listed = sql.slice(at + head.length, i).trim()
    const names = listed.startsWith('(') ? [...listed.matchAll(/`([^`]+)`/g)].map((m) => m[1]) : columns
    i += 6
    for (;;) {
      while (sql[i] !== '(') i += 1
      i += 1
      const values = []
      for (;;) {
        while (sql[i] === ' ' || sql[i] === '\n') i += 1
        if (sql[i] === "'") {
          let out = ''
          i += 1
          for (;;) {
            const c = sql[i]
            if (c === '\\') {
              const n = sql[i + 1]
              out += { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a', b: '\b' }[n] ?? n
              i += 2
            } else if (c === "'") {
              if (sql[i + 1] === "'") {
                out += "'"
                i += 2
              } else {
                i += 1
                break
              }
            } else {
              out += c
              i += 1
            }
          }
          values.push(out)
        } else {
          let j = i
          while (sql[j] !== ',' && sql[j] !== ')') j += 1
          const raw = sql.slice(i, j).trim()
          values.push(raw === 'NULL' ? null : raw)
          i = j
        }
        while (sql[i] === ' ' || sql[i] === '\n') i += 1
        if (sql[i] === ',') {
          i += 1
          continue
        }
        if (sql[i] === ')') {
          i += 1
          break
        }
        throw new Error(`unexpected ${sql.slice(i, i + 20)} in ${table}`)
      }
      rows.push(Object.fromEntries(names.map((c, k) => [c, values[k]])))
      while (sql[i] === ' ' || sql[i] === '\n') i += 1
      if (sql[i] === ',') {
        i += 1
        continue
      }
      break
    }
    at = sql.indexOf(head, i)
  }
  return rows
}

/**
 * The table prefix of a WordPress dump (`tr_` for the Tracy Business archive), read from the
 * `*_options` table name. Refuses a dump that holds two candidate prefixes.
 */
export function wordpressPrefix(sql) {
  const found = new Set(
    tableNames(sql)
      .filter((t) => t.endsWith('options'))
      .map((t) => t.slice(0, -'options'.length))
  )
  if (found.size !== 1)
    throw new Error(`cannot tell the table prefix: ${[...found].join(', ') || 'no options table'}`)
  return [...found][0]
}

/**
 * A PHP-serialized array of scalars — `a:2:{s:2:"en";i:42;s:2:"de";i:60;}` — as an object.
 * Polylang stores translation groups and language descriptors this way. Nested arrays are not
 * needed here and are refused rather than half-read.
 */
export function phpArray(text) {
  if (typeof text !== 'string' || !text.startsWith('a:')) return null
  const out = {}
  const re =
    /(?:s:\d+:"((?:[^"\\]|\\.)*)"|i:(\d+));(?:s:\d+:"((?:[^"\\]|\\.)*)"|i:(-?\d+)|b:([01])|d:([0-9.]+));/g
  let m
  while ((m = re.exec(text))) {
    const key = m[1] !== undefined ? m[1] : m[2]
    const value =
      m[3] !== undefined
        ? m[3]
        : m[4] !== undefined
          ? Number(m[4])
          : m[5] !== undefined
            ? m[5] === '1'
            : Number(m[6])
    out[key] = value
  }
  return out
}
