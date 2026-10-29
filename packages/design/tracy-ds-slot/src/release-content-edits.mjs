/**
 * Demo-content edits for the next version of a JA Joomla quickstart (release-joomla.mjs --replace).
 *
 * A webroot + database release ships its database as the same dump, byte for byte; the overlay only
 * reaches files. When the demo content itself carries a defect (Tracy Base 1.0.3: the social proof's
 * kicker painted with the warning colour in module 229's HTML), the fix is a literal text edit made
 * the same way in two places: the dump the release ships, and the presentation lock that pins that
 * module's content (the plugin compares the lock with the site's rows when it binds; a dump that
 * changed alone is refused as "Presentation drift").
 *
 * The edits file: { "edits": [{ "entity": "module-229", "from": "...", "to": "...", "count": 1 }] }.
 * `from` and `to` are plain ASCII without quotes, backslashes or slashes, so the text is the same in
 * a MySQL dump and in the lock's JSON (both escape exactly those characters); `count` is how many
 * times `from` occurs in the dump, and in the lock's `entities.<entity>.content`, before the edit.
 *
 * A setting of a row's JSON field (a menu item's `params`) is edited as one JSON pair: `"json": true`,
 * `"field": "params"`, `"from": "\"orderby_sec\":\"random\""`, `"to": "\"orderby_sec\":\"rdate\""` (JA Resume
 * 1.0.5: its social feed listed in a new random order on every load). The pair's double quotes are the only
 * quotes allowed: a MySQL dump and the lock's JSON both write them as \", so that is the text looked for in
 * both; the key stays, only its value changes. `count` is counted the same way, in the dump, in the lock, and
 * in the entity's field.
 *
 * `"reuses": true` says the new text is content the demo already carries in another row (JA Donate 1.0.7: the
 * Donate - Green/Orange slideshow's dead YouTube id takes the id the default home's slideshow plays). Then `to`
 * may already occur in the dump; a second run is still refused, by the count of `from`.
 *
 * `"row": true` (needs `field`) keeps an edit inside its entity: `from` is counted and replaced only in the
 * `field` column of that entity's row of the dump (`module-100` = the row of `#__modules` whose `id` is 100,
 * found by the INSERT's column list or the table's CREATE TABLE) and in `entities.<entity>.<field>` of the
 * lock (JA Restaurant 1.0.6: module 100's hero writes "Bar &amp; Restaurant" in its params, and module 122's
 * HTML holds the same link, which is right there). `to` may then already occur elsewhere in the row (the
 * module's title says "Bar & Restaurant"): a second run is refused by the count of `from`. `to` may be empty
 * on any edit (a value cleared: the same release's module 142 carried another restaurant's OpenTable id).
 *
 * `"nested": true` (needs `json`, `row` and `field`) is a JSON pair inside a JSON string that the column's JSON holds
 * (JA Diner 1.0.3: an ACM module keeps its settings in `jatools-config`, a JSON string inside `params`, and the
 * button of modules 121 and 122 linked to "#" beside four image links that are "#" too, rule PAGE-5). Its quotes
 * are \\\" in the dump and in the lock's text (escaped twice) and \" in the column's value; its value may also
 * be an array of one string (`"f[button-link]":["index.php?Itemid=144"]`, the shape ACM writes), and an edit keeps
 * that shape: a string that became an array would leave the slot sampling the key pointing at the whole array.
 * The content map's slot whose `jsonPath` ends at that key (or at its first item) and samples the old value takes
 * the new one.
 *
 * `"whole": true` (needs `field`) sets one column of the entity's row: `from` is the column's whole value as the
 * dump writes it (a quoted string, never NULL), `to` the new one, `count` 1 (JA Restaurant 1.0.6: articles of
 * one category given distinct `publish_up`, where the row's `modified` holds the same date).
 *
 * `"table": "<name>"` in place of `entity` edits a table that holds no contract entity, in the dump alone: the copies
 * Joomla keeps of a row's text outside it (JA Cagox 1.0.2: an article's picture caption was edited, and its copies in
 * the tag index `ucm_content` and the Smart Search index `finder_links` still printed the old words on the tag page).
 * `from` is counted inside that table's rows only; the lock and the content map never hold those tables, so they are
 * left as they are. A table that holds contract entities (`content`, `modules`…) is refused: edit those by `entity`.
 * Smart Search keeps PHP-serialized strings, whose length is written beside them: there `to` must keep `from`'s length.
 */
import { readFileSync } from 'node:fs'

const SAFE = /^[\x20-\x7e]+$/
const UNSAFE = /["'\\/]/
/** One JSON pair: a quoted key, then a string, number, true, false or null; no quote inside a string. */
const JSON_PAIR = /^"([\w-]+)":("[^"]*"|-?\d+(\.\d+)?|true|false|null)$/
/** A nested pair: the same, or an array of one string, and a key that may carry ACM's brackets (`f[button-link]`). */
const NESTED_PAIR = /^"([\w[\]-]+)":("[^"]*"|\["[^"]*"\]|-?\d+(\.\d+)?|true|false|null)$/
const pairOf = (e, v) => (e.nested === true ? NESTED_PAIR : JSON_PAIR).exec(v)
/** A nested pair's value type: an array of one string, a string, or a bare value. */
const shapeOf = (value) => (value.startsWith('[') ? 'array' : value.startsWith('"') ? 'string' : 'value')
/** A nested edit that turns a string into an array (or back) re-shapes the path a content slot samples: refused. */
function sameShape(e, at) {
  if (shapeOf(NESTED_PAIR.exec(e.from)[2]) !== shapeOf(NESTED_PAIR.exec(e.to)[2]))
    throw new Error(
      `${at}: a nested pair edit keeps its value type (a string stays a string, an array an array)`
    )
}
const NOT_IN_PAIR = /['\\/]/
const FIELD = /^[a-zA-Z_]+$/

/** The text an edit's `from` / `to` is in a dump and in the lock file (a JSON pair's quotes as \"). */
const asWritten = (e, k) =>
  e.nested === true ? e[k].replaceAll('"', '\\\\\\"') : e.json === true ? e[k].replaceAll('"', '\\"') : e[k]
/** The text an edit's `from` / `to` is in the column's own value (a nested pair's quotes as \"). */
const inValue = (e, k) => (e.nested === true ? e[k].replaceAll('"', '\\"') : e[k])

/** Reads and checks an edits file; throws on anything the two escapings would not agree on. */
export function loadContentEdits(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const edits = doc.edits
  if (!Array.isArray(edits) || !edits.length) throw new Error(`${file}: no "edits"`)
  for (const [i, e] of edits.entries()) {
    const at = `${file} edit ${i + 1}`
    if (e.table !== undefined) {
      if (e.entity !== undefined) throw new Error(`${at}: an edit names either "entity" or "table"`)
      if (!/^[a-z_]+$/.test(String(e.table)))
        throw new Error(`${at}: "table" is not a table name without its prefix`)
      if (Object.values(TABLES).includes(e.table))
        throw new Error(`${at}: "${e.table}" holds contract entities: edit them by "entity"`)
      if (
        e.json !== undefined ||
        e.row !== undefined ||
        e.whole !== undefined ||
        e.nested !== undefined ||
        e.field !== undefined
      )
        throw new Error(`${at}: a "table" edit is a plain text edit (no field, json, row, whole or nested)`)
    } else if (!/^[a-zA-Z]+-\d+$/.test(String(e.entity)))
      throw new Error(`${at}: "entity" is not like module-229`)
    if (e.field !== undefined && !FIELD.test(String(e.field)))
      throw new Error(`${at}: "field" is not a column name`)
    if (e.json !== undefined && e.json !== true) throw new Error(`${at}: "json" is true or absent`)
    if (e.reuses !== undefined && e.reuses !== true) throw new Error(`${at}: "reuses" is true or absent`)
    if (e.row !== undefined && e.row !== true) throw new Error(`${at}: "row" is true or absent`)
    if (e.whole !== undefined && e.whole !== true) throw new Error(`${at}: "whole" is true or absent`)
    if (e.nested !== undefined && e.nested !== true) throw new Error(`${at}: "nested" is true or absent`)
    if (e.nested === true && (e.json !== true || e.row !== true || e.field === undefined))
      throw new Error(
        `${at}: a "nested" edit is a JSON pair ("json") kept in its "row" and names its "field"`
      )
    if (e.row === true && e.field === undefined) throw new Error(`${at}: a "row" edit names its "field"`)
    if (e.whole === true && (e.field === undefined || e.json === true || e.count !== 1))
      throw new Error(`${at}: a "whole" edit names its "field", is not a JSON pair and has "count": 1`)
    for (const k of ['from', 'to']) {
      const v = e[k]
      if (k === 'to' && v === '' && e.json !== true) continue
      if (e.json === true) {
        if (typeof v !== 'string' || !SAFE.test(v) || NOT_IN_PAIR.test(v) || !pairOf(e, v))
          throw new Error(
            `${at}: "${k}" must be one JSON pair ("key":"value") without backslashes, slashes or single quotes`
          )
      } else if (typeof v !== 'string' || !SAFE.test(v) || UNSAFE.test(v))
        throw new Error(`${at}: "${k}" must be printable ASCII without quotes, backslashes or slashes`)
    }
    if (e.json === true && pairOf(e, e.from)[1] !== pairOf(e, e.to)[1])
      throw new Error(`${at}: a JSON pair edit changes the value, not the key`)
    if (e.nested === true) sameShape(e, at)
    if (e.from === e.to) throw new Error(`${at}: "from" and "to" are the same`)
    if (!Number.isInteger(e.count) || e.count < 1)
      throw new Error(`${at}: "count" must be a whole number ≥ 1`)
  }
  return edits
}

const occurrences = (text, s) => text.split(s).length - 1

/** The table of an entity's kind, without its prefix. */
const TABLES = {
  module: 'modules',
  article: 'content',
  category: 'categories',
  menuItem: 'menu',
  templateStyle: 'template_styles'
}
const SPACE = /\s/

/** The value tuple that starts at `i` (`(`): its end and each value's span (a quoted string kept whole). */
function tupleAt(text, i) {
  const values = []
  let j = i + 1
  for (;;) {
    while (SPACE.test(text[j] ?? '')) j++
    const start = j
    if (text[j] === "'")
      for (j++; ; j++) {
        if (j >= text.length) throw new Error('dump: a string is not closed')
        if (text[j] === '\\') j++
        else if (text[j] === "'") {
          if (text[j + 1] !== "'") break
          j++
        }
      }
    // an unquoted value may call a function (CURRENT_TIMESTAMP()): its parentheses are part of the value
    for (let depth = 0; j < text.length && (depth > 0 || (text[j] !== ',' && text[j] !== ')')); j++) {
      if (text[j] === '(') depth++
      else if (text[j] === ')') depth--
    }
    values.push({ start, end: j })
    if (text[j] === ',') j++
    else if (text[j] === ')') return { start: i, end: j + 1, values }
    else throw new Error('dump: a row is not closed')
  }
}

/** The columns of `table` (prefix included) in its CREATE TABLE in one of the texts, or null. */
function createColumns(texts, table) {
  for (const text of texts) {
    const at = text.indexOf(`CREATE TABLE \`${table}\``)
    if (at < 0) continue
    return text
      .slice(at, text.indexOf(';', at))
      .split('\n')
      .slice(1)
      .map((l) => /^\s+`(\w+)`/.exec(l)?.[1])
      .filter(Boolean)
  }
  return null
}

/** Tables every Joomla dump names with its one prefix: the prefix is read from them, never guessed. */
const CORE_TABLES = [
  'assets',
  'categories',
  'content',
  'extensions',
  'menu',
  'modules',
  'template_styles',
  'users'
]
const escapeRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/**
 * A column only that core table has. A longer candidate (`jd_virtuemart_` beside `jd_`) whose every table is named
 * like a core one but whose CREATE TABLE lacks that column is an extension's own tables (VirtueMart's
 * `jd_virtuemart_categories`, `jd_virtuemart_modules`, `jd_virtuemart_vendor_users`: JA Cagox 1.0.2), a fragment, not
 * a copy of Joomla's schema under a second prefix. A table the texts carry no CREATE TABLE for is judged by name.
 */
const CORE_COLUMN = {
  assets: 'rules',
  categories: 'extension',
  content: 'introtext',
  extensions: 'element',
  menu: 'menutype',
  modules: 'position',
  template_styles: 'template',
  users: 'username'
}

/**
 * Joomla's own tables whose names end with a core table's name, read from the Joomla 6 installers of JA Fresco and
 * JA Diner 1.0.2 (installation/sql/mysql/*.sql): under a prefix they make a longer candidate (`#__ucm_` from
 * `#__ucm_content`) that is a fragment of a table name, not a prefix.
 */
const JOOMLA_TABLES_ENDING_IN_CORE = new Set([
  'action_logs_extensions',
  'action_logs_users',
  'fields_categories',
  'modules_menu',
  'ucm_content',
  'update_sites_extensions'
])

/**
 * The table prefix of a dump: a site's own (`jd_`, `foo_bar_`) or an installer's placeholder (`#__`), read from the
 * tables named like a core table. A longer candidate is a fragment of a shorter one only when every table it is
 * credited with is, under the shorter prefix, one of Joomla's own tables (`#__ucm_content` is `ucm_content` of
 * `#__`, `#__modules_menu` is `modules_menu`); otherwise it is a real prefix (`tr_foo_modules` beside `tr_modules`).
 * A real Joomla dump carries one prefix: more than one real prefix, tied or not, is refused naming them all, since
 * an edit would reach one copy of a row and silently leave the others. Null when no core table is named.
 */
export function dumpPrefix(texts) {
  const names = new Set()
  for (const text of texts)
    for (const m of text.matchAll(/(?:INSERT INTO|CREATE TABLE(?: IF NOT EXISTS)?)\s+`([^`]+)`/g))
      names.add(m[1])
  /** candidate prefix -> the tables it is credited with */
  const tables = new Map()
  for (const name of names)
    for (const core of CORE_TABLES)
      if (name.length > core.length && name.endsWith(core) && name.at(-core.length - 1) === '_') {
        const prefix = name.slice(0, -core.length)
        tables.set(prefix, [...(tables.get(prefix) ?? []), name])
      }
  /** The table's CREATE TABLE in the texts lacks the column its core name promises: an extension's own table. */
  const notCore = (table, prefix) => {
    const columns = createColumns(texts, table)
    return columns !== null && !columns.includes(CORE_COLUMN[table.slice(prefix.length)])
  }
  const fragment = (prefix, credited) =>
    [...tables.keys()].some(
      (shorter) =>
        shorter.length < prefix.length &&
        prefix.startsWith(shorter) &&
        credited.every((t) => JOOMLA_TABLES_ENDING_IN_CORE.has(t.slice(shorter.length)) || notCore(t, prefix))
    )
  const real = [...tables]
    .filter(([prefix, credited]) => !fragment(prefix, credited))
    .sort((a, b) => b[1].length - a[1].length)
  if (real.length > 1)
    throw new Error(
      `dump: ${real.length} table prefixes name core tables (${real.map(([p, t]) => `${p} ${t.length}`).join(', ')}): a Joomla dump carries one, so which one the edits mean is not known`
    )
  return real[0]?.[0] ?? null
}

/**
 * The row of an entity in one of the texts: `{ index, start, end, values, columns }`. The columns come from
 * the INSERT's own list, else the table's CREATE TABLE; the row is the one whose `id` column (wherever the
 * list puts it) holds the entity's id. Throws when an INSERT's column order is unknown, or unless exactly
 * one row has that id.
 */
function rowOf(texts, entity) {
  const [, kind, id] = /^([a-zA-Z]+)-(\d+)$/.exec(entity)
  const table = TABLES[kind]
  if (!table) throw new Error(`dump: no table for ${entity}`)
  const prefix = dumpPrefix(texts)
  if (prefix === null) throw new Error(`dump: no Joomla core table names the table prefix (${entity})`)
  const insert = new RegExp(
    `INSERT INTO \`(${escapeRe(prefix)})${table}\`\\s*(?:\\(([^)]*)\\)\\s*)?VALUES`,
    'g'
  )
  const names = (s) => [...s.matchAll(/`(\w+)`/g)].map((x) => x[1])
  const rows = []
  texts.forEach((text, index) => {
    for (const m of text.matchAll(insert)) {
      const columns = m[2] ? names(m[2]) : createColumns(texts, `${m[1]}${table}`)
      if (!columns)
        throw new Error(
          `dump: an INSERT into ${m[1]}${table} names no columns and the table has no CREATE TABLE`
        )
      const at = columns.indexOf('id')
      if (at < 0) throw new Error(`dump: ${m[1]}${table} has no id column`)
      let j = m.index + m[0].length
      for (;;) {
        while (SPACE.test(text[j] ?? '')) j++
        if (text[j] !== '(') break
        const t = tupleAt(text, j)
        if (t.values.length !== columns.length)
          throw new Error(
            `dump: a row of ${m[1]}${table} has ${t.values.length} values for ${columns.length} columns`
          )
        const v = text.slice(t.values[at].start, t.values[at].end).replace(/^'|'$/g, '')
        if (v === id) rows.push({ index, ...t, columns })
        j = t.end
        while (SPACE.test(text[j] ?? '')) j++
        if (text[j] !== ',') break
        j++
      }
    }
  })
  if (rows.length !== 1) throw new Error(`dump: ${rows.length} rows of ${entity}, the edit expects 1`)
  return rows[0]
}

/** The spans of every row of `<prefix><table>` in the dump texts: `{ index, start, end }`. */
function tableRows(texts, table) {
  const prefix = dumpPrefix(texts)
  if (prefix === null) throw new Error(`dump: no Joomla core table names the table prefix (${table})`)
  const insert = new RegExp(`INSERT INTO \`${escapeRe(prefix)}${table}\`\\s*(?:\\([^)]*\\)\\s*)?VALUES`, 'g')
  const rows = []
  texts.forEach((text, index) => {
    for (const m of text.matchAll(insert)) {
      let j = m.index + m[0].length
      for (;;) {
        while (SPACE.test(text[j] ?? '')) j++
        if (text[j] !== '(') break
        const t = tupleAt(text, j)
        rows.push({ index, start: t.start, end: t.end })
        j = t.end
        while (SPACE.test(text[j] ?? '')) j++
        if (text[j] !== ',') break
        j++
      }
    }
  })
  return { prefix, rows }
}

/** One table edit in the dump texts, in place: `from` counted and replaced inside that table's rows only. */
function editTable(out, e) {
  const { prefix, rows } = tableRows(out, e.table)
  const n = rows.reduce((sum, r) => sum + occurrences(out[r.index].slice(r.start, r.end), e.from), 0)
  if (n !== e.count)
    throw new Error(`dump: "${e.from}" occurs ${n} times in ${prefix}${e.table}, the edit expects ${e.count}`)
  // from the last row back, so the spans still to edit keep their offsets
  for (const r of [...rows].reverse()) {
    const text = out[r.index]
    out[r.index] =
      text.slice(0, r.start) + text.slice(r.start, r.end).split(e.from).join(e.to) + text.slice(r.end)
  }
}

/** One row-kept edit (`row` or `whole`) in the dump texts, in place: only the value of the named column. */
function editRow(out, e) {
  const r = rowOf(out, e.entity)
  const text = out[r.index]
  const c = r.columns.indexOf(e.field)
  if (c < 0) throw new Error(`dump: ${e.entity} has no column ${e.field}`)
  const v = r.values[c]
  const now = text.slice(v.start, v.end)
  if (e.whole === true) {
    if (now !== `'${e.from}'`)
      throw new Error(`dump: ${e.entity}.${e.field} is ${now}, the edit expects '${e.from}'`)
    out[r.index] = `${text.slice(0, v.start)}'${e.to}'${text.slice(v.end)}`
    return
  }
  const from = asWritten(e, 'from')
  const n = occurrences(now, from)
  if (n !== e.count)
    throw new Error(
      `dump: "${from}" occurs ${n} times in ${e.entity}.${e.field}, the edit expects ${e.count}`
    )
  out[r.index] = text.slice(0, v.start) + now.split(from).join(asWritten(e, 'to')) + text.slice(v.end)
}

/**
 * Applies the edits to the database text: one dump, or the installer's SQL files (an array, counted
 * together). Throws when an edit's `from` does not occur exactly `count` times, or when `to`
 * already occurs (a second run would edit nothing and say nothing).
 */
export function editDump(texts, edits) {
  const one = typeof texts === 'string'
  let out = one ? [texts] : [...texts]
  for (const e of edits) {
    if (e.table !== undefined) {
      editTable(out, e)
      continue
    }
    if (e.row === true || e.whole === true) {
      editRow(out, e)
      continue
    }
    const from = asWritten(e, 'from')
    const to = asWritten(e, 'to')
    const n = out.reduce((sum, t) => sum + occurrences(t, from), 0)
    if (n !== e.count) throw new Error(`dump: "${from}" occurs ${n} times, the edit expects ${e.count}`)
    // a JSON pair's new value may be another row's setting already (most feeds list newest first): a second
    // run is still refused, by the count of `from`
    if (e.json !== true && e.reuses !== true && to !== '' && out.some((t) => t.includes(to)))
      throw new Error(`dump: "${to}" is already there`)
    out = out.map((t) => t.split(from).join(to))
  }
  return one ? out[0] : out
}

/**
 * The same edits in the presentation lock's text (the capture tool's own escaping is kept: only the
 * edited characters change). Each `from` must occur `count` times inside its entity's content and
 * nowhere else in the lock.
 */
export function editLock(lockText, edits) {
  let out = lockText
  for (const e of edits) {
    if (e.table !== undefined) continue // a table outside the contract: the lock never holds it
    if (e.row === true || e.whole === true) {
      out = editLockRow(out, e)
      continue
    }
    const field = e.field ?? 'content'
    const content = JSON.parse(out).entities?.[e.entity]?.[field]
    if (typeof content !== 'string') throw new Error(`lock: no entities.${e.entity}.${field}`)
    const from = asWritten(e, 'from')
    const inEntity = occurrences(content, e.from)
    const inLock = occurrences(out, from)
    if (inEntity !== e.count || inLock !== e.count)
      throw new Error(
        `lock: "${e.from}" occurs ${inEntity} times in ${e.entity} and ${inLock} in the lock, the edit expects ${e.count}`
      )
    out = out.split(from).join(asWritten(e, 'to'))
    if (e.to !== '' && occurrences(JSON.parse(out).entities[e.entity][field], e.to) !== e.count)
      throw new Error(`lock: ${e.entity} not edited`)
  }
  return out
}

const regexText = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The span of `entities.<entity>`'s object in the lock's text (its braces matched outside strings). */
function entitySpan(text, entity) {
  const key = new RegExp(`${regexText(JSON.stringify(entity))}\\s*:\\s*\\{`, 'g')
  const at = [...text.matchAll(key)]
  if (at.length !== 1) throw new Error(`lock: ${at.length} objects keyed ${entity}, the edit expects 1`)
  const start = at[0].index + at[0][0].length - 1
  let depth = 0
  for (let j = start; j < text.length; j++) {
    const c = text[j]
    if (c === '"') {
      for (j++; text[j] !== '"'; j++) if (text[j] === '\\') j++
    } else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return { start, end: j + 1 }
  }
  throw new Error(`lock: ${entity} is not closed`)
}

/**
 * The span of the string literal that `entities.<entity>.<field>` holds in the lock's text: the key read
 * at the entity object's own depth, so a key of the same name in a nested object is not the field.
 */
function fieldSpan(text, { start, end }, e) {
  const found = []
  let depth = 0
  const skip = (j) => {
    for (j++; text[j] !== '"'; j++) if (text[j] === '\\') j++
    return j
  }
  for (let j = start; j < end; j++) {
    const c = text[j]
    if (c === '"') {
      const s = j
      j = skip(j)
      if (depth !== 1) continue
      let k = j + 1
      while (/\s/.test(text[k])) k++
      if (text[k] !== ':' || JSON.parse(text.slice(s, j + 1)) !== e.field) continue
      for (k++; /\s/.test(text[k]); k++);
      if (text[k] !== '"') throw new Error(`lock: ${e.entity}.${e.field} is not a string`)
      j = skip(k)
      found.push({ start: k, end: j + 1 })
    } else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') depth--
  }
  if (found.length !== 1)
    throw new Error(`lock: ${found.length} keys ${e.field} in ${e.entity}, the edit expects 1`)
  return found[0]
}

/**
 * A row-kept edit in the lock: made only inside the string of `entities.<entity>.<field>`, counted there
 * as the dump counts its column, and every other value of the lock left as it was (checked on the
 * parsed lock). A field the entity's lock object does not carry is not pinned, so the edit is the
 * dump's alone; the entity itself must be in the lock.
 */
function editLockRow(lockText, e) {
  const was = JSON.parse(lockText)
  const entity = was.entities?.[e.entity]
  if (!entity || typeof entity !== 'object') throw new Error(`lock: no entities.${e.entity}`)
  // a column the lock does not pin (an article's `created`, JA Diner 1.0.3) is the dump's alone: nothing to drift
  if (!Object.hasOwn(entity, e.field)) return lockText
  const value = entity[e.field]
  if (typeof value !== 'string') throw new Error(`lock: no entities.${e.entity}.${e.field}`)
  const { start, end } = fieldSpan(lockText, entitySpan(lockText, e.entity), e)
  const literal = lockText.slice(start, end)
  let next
  let expected
  if (e.whole === true) {
    if (value !== e.from)
      throw new Error(`lock: ${e.entity}.${e.field} is ${value}, the edit expects ${e.from}`)
    next = JSON.stringify(e.to)
    expected = e.to
  } else {
    const n = occurrences(value, inValue(e, 'from'))
    const inText = occurrences(literal, asWritten(e, 'from'))
    if (n !== e.count || inText !== e.count)
      throw new Error(
        `lock: "${e.from}" occurs ${n} times in ${e.entity}.${e.field} and ${inText} in its text, the edit expects ${e.count}`
      )
    next = literal.split(asWritten(e, 'from')).join(asWritten(e, 'to'))
    expected = value.split(inValue(e, 'from')).join(inValue(e, 'to'))
  }
  const out = lockText.slice(0, start) + next + lockText.slice(end)
  const now = JSON.parse(out)
  if (now.entities[e.entity][e.field] !== expected) throw new Error(`lock: ${e.entity}.${e.field} not edited`)
  now.entities[e.entity][e.field] = value
  if (JSON.stringify(now) !== JSON.stringify(was))
    throw new Error(`lock: ${e.entity} not edited as its field alone`)
  return out
}

/** A slot's sample in the content map's text with `from` replaced inside it, every other byte kept. */
function editSampleText(out, slot, from, to) {
  const at = out.indexOf(`"key": ${JSON.stringify(slot.key)}`)
  if (at < 0) throw new Error(`content map: slot ${slot.key} not found as text`)
  const open = out.indexOf('"sample": "', at)
  if (open < 0) throw new Error(`content map: ${slot.key} sample not found as text`)
  const q = open + '"sample": '.length
  let j = q + 1
  for (; out[j] !== '"'; j++) if (out[j] === '\\') j++
  const literal = out.slice(q, j + 1)
  if (JSON.parse(literal) !== slot.sample)
    throw new Error(`content map: ${slot.key} sample not found as text`)
  const next = literal.split(from).join(to)
  if (JSON.parse(next) !== slot.sample.split(from).join(to))
    throw new Error(`content map: ${slot.key} sample not edited as text`)
  return out.slice(0, q) + next + out.slice(j + 1)
}

/**
 * A nested pair's new value in the slots that sample it: the slots of the entity's column whose `jsonPath` ends at
 * the pair's key (a string value) or at the first item under it (an array of one string), sampling the old value.
 */
function editNestedSamples(out, map, e, edited) {
  sameShape(e, `content map: ${e.entity}`)
  const [, key, fromValue] = NESTED_PAIR.exec(e.from)
  const [, , toValue] = NESTED_PAIR.exec(e.to)
  const array = fromValue.startsWith('[')
  const from = JSON.parse(array ? fromValue.slice(1, -1) : fromValue)
  const to = JSON.parse(toValue.startsWith('[') ? toValue.slice(1, -1) : toValue)
  const text = typeof from === 'string' && typeof to === 'string'
  // a number, a boolean or null: a slot samples it as that value or as its text (the capture writes either)
  const samples = (s) => s === from || (!text && typeof s === 'string' && s === String(from))
  for (const slot of map.slots ?? []) {
    if (slot.entity !== e.entity || slot.column !== e.field || !samples(slot.sample)) continue
    const path = slot.jsonPath ?? []
    const at = array ? path.length - 2 : path.length - 1
    if (path[at] !== key || (array && path[at + 1] !== 0)) continue
    out = text
      ? editSampleText(out, slot, from, to)
      : setSample(out, slot, typeof slot.sample === 'string' ? String(to) : to)
    edited.push(slot.key)
  }
  return out
}

/** A slot's whole sample in the content map's text set to `next` (a string or a JSON primitive), every other byte kept. */
function setSample(out, slot, next) {
  const at = out.indexOf(`"key": ${JSON.stringify(slot.key)}`)
  if (at < 0) throw new Error(`content map: slot ${slot.key} not found as text`)
  const open = out.indexOf('"sample": ', at)
  const close = out.indexOf('}', at)
  if (open < 0 || open > close) throw new Error(`content map: ${slot.key} sample not found as text`)
  const q = open + '"sample": '.length
  let j = q
  if (out[q] === '"') {
    for (j = q + 1; out[j] !== '"'; j++) if (out[j] === '\\') j++
  } else {
    while (j + 1 < out.length && !/[,}\s]/.test(out[j + 1])) j++
  }
  const literal = out.slice(q, j + 1)
  if (JSON.parse(literal) !== slot.sample)
    throw new Error(`content map: ${slot.key} sample not found as text`)
  return out.slice(0, q) + JSON.stringify(next) + out.slice(j + 1)
}

/** The text of a text-node edit (`>MT<` → `MT`), or null when the edit is not a whole text node. */
const textNode = (s) => /^>([^<>]+)<$/.exec(s)?.[1] ?? null

/**
 * The same edits in the content map's slot samples: a slot of the edited entity whose `sample` is the
 * whole text node an edit replaces takes the new text (Tracy Base 1.0.4: the team avatars' initials of
 * module 236, `>MT<` → `>AH<`). Left as it was, the sample names text the shipped dump no longer holds,
 * and the readiness check holds the release (STAB-1 "slot samples are not in their column of the dump").
 * Only the matching `"sample"` values change, as text, so every other byte stays the capture's own.
 * @param {string} mapText the content map as text
 * @param {{ entity: string, from: string, to: string }[]} edits
 * @returns {{ text: string, edited: string[] }} the keys of the slots whose sample changed
 */
export function editContentMap(mapText, edits) {
  const map = JSON.parse(mapText)
  let out = mapText
  const edited = []
  for (const e of edits) {
    if (e.table !== undefined) continue // no slot samples a table outside the contract
    // a whole text node (`>MT<`), or a value a slot samples whole (JA Donate 1.0.7: the slideshow
    // video id module-91.8 samples, `AjGyuHm5q4s` -> `gGFQybMEPeM`)
    if (e.nested === true) {
      out = editNestedSamples(out, map, e, edited)
      continue
    }
    const node = textNode(e.from) !== null && textNode(e.to) !== null
    const from = node ? textNode(e.from) : e.json === true ? null : e.from
    const to = node ? textNode(e.to) : e.to
    if (from === null || to === null) continue
    const kept = e.row === true || e.whole === true
    for (const slot of map.slots ?? []) {
      if (slot.entity !== e.entity) continue
      // a row-kept edit: only the slots of the edited column, and (`row`) the text inside a longer sample too
      // (JA Restaurant 1.0.6: module-100.0 samples "Welcome to RES ((br/))Bar &amp; Restaurant")
      if (kept && slot.column !== (e.field ?? 'content')) continue
      if (slot.sample !== from && e.row === true && !node && String(slot.sample ?? '').includes(from)) {
        out = editSampleText(out, slot, from, to)
        edited.push(slot.key)
        continue
      }
      if (slot.sample !== from) continue
      // the slot's own object, found by its key, then its sample inside it
      const at = out.indexOf(`"key": ${JSON.stringify(slot.key)}`)
      if (at < 0) throw new Error(`content map: slot ${slot.key} not found as text`)
      const close = out.indexOf('}', at)
      const field = `"sample": ${JSON.stringify(from)}`
      const where = out.indexOf(field, at)
      if (where < 0 || where > close) throw new Error(`content map: ${slot.key} sample not found as text`)
      out = out.slice(0, where) + `"sample": ${JSON.stringify(to)}` + out.slice(where + field.length)
      edited.push(slot.key)
    }
  }
  return { text: out, edited }
}
