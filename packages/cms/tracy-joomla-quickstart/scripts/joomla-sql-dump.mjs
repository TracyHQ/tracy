/**
 * Read and write the demo data of a Joomla quickstart installer: `installation/sql/mysql/custom.sql`, a mysqldump
 * whose table names carry the `#__` prefix the installer replaces.
 *
 * WHY a parser that writes back: the AI quickstart production step (ADR 0045) removes demo rows and must leave every
 * other row exactly as the template shipped it, so its result can be compared with the human quickstart byte for
 * byte. The dump is kept as a list of parts: opaque text (DROP/CREATE TABLE, comments, LOCK lines), INSERT statements
 * split into rows and cells, and UPDATE statements. Only a cell somebody sets is re-encoded.
 *
 * Read side only `mysqldump.mjs` (tracy-quickstart-tools) exists; it does not keep the source text, so it cannot
 * write a dump back. This one does both for the installer form (`CREATE TABLE IF NOT EXISTS`, a column list, one row
 * per line).
 */

// Any case, indented, and the INSERT forms mysqldump or a hand edit may use.
const STATEMENT = /^[ \t]*(INSERT(?: IGNORE)? INTO|REPLACE INTO|UPDATE) `([^`]+)`/gim
// A data statement left in a text part was not read; the dump cannot be trusted to say what rows it holds.
const DATA_LINE = /^[ \t]*(?:insert|replace|update|delete)\b[^\n]*/gim
const PREFIX = '#__'
const UNESCAPE = { n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a', b: '\b' }

/** @param {string} sql */
export function parseDump(sql) {
  const parts = []
  const createColumns = new Map()
  const unparsed = []
  let at = 0
  for (;;) {
    STATEMENT.lastIndex = at
    const m = STATEMENT.exec(sql)
    const textEnd = m ? m.index : sql.length
    if (textEnd > at) {
      const text = sql.slice(at, textEnd)
      readCreateColumns(text, createColumns)
      for (const line of text.matchAll(DATA_LINE))
        unparsed.push(`unparsed statement: ${line[0].trim().slice(0, 60)}`)
      parts.push({ kind: 'text', text })
    }
    if (!m) break
    const table = m[2].startsWith(PREFIX) ? m[2].slice(PREFIX.length) : m[2]
    if (!m[2].startsWith(PREFIX)) unparsed.push(`statement on table ${m[2]} without the #__ prefix`)
    if (m[1].toUpperCase() === 'UPDATE') {
      const end = statementEnd(sql, m.index)
      const text = sql.slice(m.index, end)
      parts.push({ kind: 'update', table, text, id: updateTargetId(text) })
      at = end
    } else {
      const part = readInsert(sql, m.index, table, createColumns)
      parts.push(part)
      at = part.endsAt
      delete part.endsAt
    }
  }
  return { parts, unparsed }
}

/** The dump as text again. A part or row nobody changed is the text it was read from. */
export function serializeDump(dump) {
  let out = ''
  for (const part of dump.parts) {
    if (part.kind !== 'insert') {
      out += part.text
      continue
    }
    if (part.rows.length === 0) {
      // The INSERT is gone with its rows; the newline that ended it belongs to the next text part.
      continue
    }
    out += part.head
    part.rows.forEach((row, i) => {
      out += (i === 0 ? part.lead : row.sep) + '(' + row.cells.map((c) => c.raw).join(',') + ')'
    })
    out += ';'
  }
  return out
}

/** Every row of one table (name without `#__`) as `{column: value}`, in dump order. */
export function records(dump, table) {
  return inserts(dump, table).flatMap((part) => part.rows.map((row) => record(part, row)))
}

/** Remove the rows of `table` the predicate accepts; returns their records. */
export function removeRows(dump, table, predicate) {
  const removed = []
  for (const part of inserts(dump, table)) {
    part.rows = part.rows.filter((row) => {
      const r = record(part, row)
      if (!predicate(r)) return true
      removed.push(r)
      return false
    })
  }
  return removed
}

/** Set `column` to `value` on the rows the predicate accepts; returns how many changed. */
export function setValue(dump, table, predicate, column, value) {
  let changed = 0
  for (const part of inserts(dump, table)) {
    const at = part.columns.indexOf(column)
    if (at === -1) continue
    for (const row of part.rows) {
      if (!predicate(record(part, row)) || row.cells[at].value === value) continue
      row.cells[at] = { raw: sqlQuote(value), value }
      changed += 1
    }
  }
  return changed
}

/** The UPDATE statements: `{table, id, text}`, `id` being the `id` their WHERE names, or null. */
export function updates(dump) {
  return dump.parts.filter((p) => p.kind === 'update')
}

/** A value as mysqldump writes it. */
export function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL'
  const map = { '\\': '\\\\', "'": "\\'", '"': '\\"', '\n': '\\n', '\r': '\\r', '\0': '\\0', '\x1a': '\\Z' }
  return "'" + Array.from(String(value), (c) => map[c] ?? c).join('') + "'"
}

/** The text a quoted SQL literal holds: `inner` is what sits between the quotes. */
export function sqlUnquote(inner) {
  return inner.replace(/\\(.)|''/gs, (m, c) => (m === "''" ? "'" : (UNESCAPE[c] ?? c)))
}

function inserts(dump, table) {
  return dump.parts.filter((p) => p.kind === 'insert' && p.table === table)
}

function record(part, row) {
  return Object.fromEntries(part.columns.map((c, i) => [c, row.cells[i]?.value ?? null]))
}

function readCreateColumns(text, into) {
  for (const m of text.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?`([^`]+)` \(\n([\s\S]*?)\n\) /g)) {
    const name = m[1].startsWith(PREFIX) ? m[1].slice(PREFIX.length) : m[1]
    into.set(
      name,
      [...m[2].matchAll(/^\s+`([^`]+)`/gm)].map((c) => c[1])
    )
  }
}

function readInsert(sql, start, table, createColumns) {
  const values = sql.slice(start).search(/\bVALUES\b/i) + start
  const head = sql.slice(start, values + 'VALUES'.length)
  const listed = head.slice(head.indexOf('`', head.indexOf('`') + 1) + 1, -'VALUES'.length)
  const columns = listed.includes('(')
    ? [...listed.matchAll(/`([^`]+)`/g)].map((c) => c[1])
    : createColumns.get(table)
  if (!columns)
    throw new Error(`INSERT into ${table} names no columns and the dump has no CREATE TABLE before it`)
  const rows = []
  let lead = null
  let i = values + 'VALUES'.length
  for (;;) {
    const open = sql.indexOf('(', i)
    const sep = sql.slice(i, open)
    if (!(rows.length === 0 ? /^\s*$/ : /^\s*,\s*$/).test(sep)) {
      throw new Error(`unexpected ${JSON.stringify(sep.slice(0, 20))} between rows of ${table}`)
    }
    const { cells, end } = readTuple(sql, open + 1, table)
    if (rows.length === 0) lead = sep
    rows.push({ sep, cells })
    i = end
    let j = i
    while (/\s/.test(sql[j])) j += 1
    if (sql[j] === ';') return { kind: 'insert', table, head, columns, lead, rows, endsAt: j + 1 }
    if (sql[j] !== ',')
      throw new Error(`unexpected ${JSON.stringify(sql.slice(j, j + 20))} after a row of ${table}`)
  }
}

/** Cells from just after `(` to the matching `)`; `end` is the index after `)`. */
function readTuple(sql, from, table) {
  const cells = []
  let i = from
  for (;;) {
    const start = i
    while (sql[i] === ' ' || sql[i] === '\n') i += 1
    let value
    const binary = /^_[a-z0-9]+ (?=')/.exec(sql.slice(i, i + 16))
    if (binary) i += binary[0].length
    if (sql[i] === "'") {
      let out = ''
      i += 1
      for (;;) {
        const c = sql[i]
        if (c === undefined) throw new Error(`unterminated string in ${table}`)
        if (c === '\\') {
          out += UNESCAPE[sql[i + 1]] ?? sql[i + 1]
          i += 2
        } else if (c === "'" && sql[i + 1] === "'") {
          out += "'"
          i += 2
        } else if (c === "'") {
          i += 1
          break
        } else {
          out += c
          i += 1
        }
      }
      value = out
    } else {
      let j = i
      while (sql[j] !== ',' && sql[j] !== ')') j += 1
      const raw = sql.slice(i, j).trim()
      value = raw === 'NULL' ? null : raw
      i = j
    }
    while (sql[i] === ' ' || sql[i] === '\n') i += 1
    cells.push({ raw: sql.slice(start, i), value })
    if (sql[i] === ',') {
      i += 1
      continue
    }
    if (sql[i] === ')') return { cells, end: i + 1 }
    throw new Error(`unexpected ${JSON.stringify(sql.slice(i, i + 20))} in a row of ${table}`)
  }
}

/** Index after the `;` that ends the statement starting at `from`, skipping quoted text. */
function statementEnd(sql, from) {
  let quoted = false
  for (let i = from; i < sql.length; i += 1) {
    const c = sql[i]
    if (quoted) {
      if (c === '\\') i += 1
      else if (c === "'") quoted = false
    } else if (c === "'") quoted = true
    else if (c === ';') return i + 1
  }
  throw new Error('a statement has no closing semicolon')
}

/** The id an UPDATE's top-level WHERE names (`` `id` = 12 ``), or null. */
function updateTargetId(text) {
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quoted) {
      if (c === '\\') i += 1
      else if (c === "'") quoted = false
    } else if (c === "'") quoted = true
    else if (text.startsWith(' WHERE ', i)) return /^ WHERE `id` = '?(\d+)'?/.exec(text.slice(i))?.[1] ?? null
  }
  return null
}
