/**
 * Secrets a Joomla demo database carries, and blanking them in place (blank site of an AI quickstart, ticket #582).
 *
 * Measured on JA Boxing j6 1.0.8: a directory service login in the LDAP plugin, a map API key in a plugin's params,
 * and a mailing extension's security key in its `name`/`value` settings table. Accounts and sessions are removed as
 * rows elsewhere (`blank-site.mjs`); this file finds the values that sit inside settings: the `params` JSON of
 * extensions, modules, template styles and scheduled tasks (in an INSERT or in a later UPDATE), and the rows of any
 * settings table that pairs a name column with a value column.
 */

import { records, setValue, sqlQuote, sqlUnquote, updates } from './joomla-sql-dump.mjs'

/** Tables whose `params` column is a JSON text that may hold a secret. */
const PARAMS_TABLES = ['extensions', 'modules', 'template_styles', 'scheduler_tasks']
/** Column pairs of a settings table: the name of a setting beside its value. */
const NAME_COLUMNS = [
  'name',
  'config_key',
  'config_name',
  'setting',
  'setting_name',
  'option_name',
  'profile_key'
]
const VALUE_COLUMNS = ['value', 'config_value', 'setting_value', 'option_value', 'profile_value']

const SECRET_WORDS = new Set(['password', 'passwd', 'secret', 'token', 'key', 'apikey', 'privatekey'])
/** Run-together names (`joomlatoken`, `clientsecret`, `secretkey`) end in one of these. */
const SECRET_SUFFIX =
  /(secret|token|apikey|privatekey|licensekey|securitykey|secretkey|authkey|cronkey|accesskey)$/
/** Names that end in `key` and are not secrets: a meta tag, a database key, a sort key. */
const KEY_NOT_SECRET = /^(metakey|primarykey|foreignkey|sortkey|hotkey|shortcutkey|langkey|languagekey)$/

/** Whether a setting name holds a secret: `password`, `api_key`, `authKey`, `joomlatoken`, `Client-Secret`, `key`... */
export function isSecretKey(name) {
  const words = String(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const joined = words.join('')
  if (KEY_NOT_SECRET.test(joined)) return false
  const last = words[words.length - 1]
  if (last === 'passwd' || last === 'password') return true
  return SECRET_WORDS.has(last) || SECRET_SUFFIX.test(joined)
}

/**
 * Non-empty secrets, `{table, row, key}`: a secret-named key anywhere in a `params` JSON, the login of an
 * authentication plugin (a directory service credential), and a secret-named row of a settings table. Sorted, so two
 * reports compare. Values are never returned.
 */
export function findSecrets(dump) {
  const found = new Map()
  const add = (table, row, key) => found.set([table, row, key].join('\0'), { table, row: String(row), key })
  for (const part of dump.parts) {
    if (part.kind !== 'insert') continue
    const nameColumn = NAME_COLUMNS.find((c) => part.columns.includes(c))
    const valueColumn = VALUE_COLUMNS.find((c) => part.columns.includes(c))
    if (nameColumn && valueColumn) {
      for (const r of records({ parts: [part] }, part.table)) {
        if (isSecretKey(r[nameColumn]) && r[valueColumn]) add(part.table, r[nameColumn], valueColumn)
      }
    }
    if (!PARAMS_TABLES.includes(part.table) || !part.columns.includes('params')) continue
    for (const r of records({ parts: [part] }, part.table)) {
      const directory = r.type === 'plugin' && r.folder === 'authentication'
      for (const key of secretKeys(r.params, directory)) add(part.table, r[part.columns[0]], key)
    }
  }
  for (const u of updates(dump)) {
    for (const key of secretKeys(updatedParams(u)?.value, false)) add(u.table, u.id ?? 'update', key)
  }
  const order = (s) => [s.table, s.row.padStart(12, '0'), s.key].join('\0')
  return [...found.values()].sort((a, b) => (order(a) < order(b) ? -1 : 1))
}

/** Blank every secret `findSecrets` names; returns what was blanked. */
export function blankSecrets(dump) {
  const found = findSecrets(dump)
  for (const part of dump.parts) {
    if (part.kind === 'insert') blankInsert(part, found)
    else if (part.kind === 'update') blankUpdate(part)
  }
  return found
}

function blankInsert(part, found) {
  const mine = found.filter((s) => s.table === part.table)
  const dump = { parts: [part] }
  const nameColumn = NAME_COLUMNS.find((c) => part.columns.includes(c))
  const valueColumn = VALUE_COLUMNS.find((c) => part.columns.includes(c))
  for (const s of mine) {
    if (nameColumn && s.key === valueColumn)
      setValue(dump, part.table, (r) => r[nameColumn] === s.row, s.key, '')
  }
  if (!PARAMS_TABLES.includes(part.table) || !part.columns.includes('params')) return
  const id = part.columns[0]
  for (const r of records(dump, part.table)) {
    const keys = mine.filter((s) => s.row === r[id]).map((s) => s.key)
    if (keys.length)
      setValue(dump, part.table, (x) => x[id] === r[id], 'params', keys.reduce(blankJsonKey, r.params))
  }
}

function blankUpdate(part) {
  const set = updatedParams(part)
  if (!set) return
  const keys = secretKeys(set.value, false)
  if (!keys.length) return
  part.text = part.text.replace(set.literal, `${set.head}${sqlQuote(keys.reduce(blankJsonKey, set.value))}`)
}

/** The JSON text an UPDATE assigns to `params`: `{value, head, literal}`, or null. */
function updatedParams(update) {
  const m = /(`params`\s*=\s*)'((?:[^'\\]|\\.|'')*)'/s.exec(update.text)
  return m ? { value: sqlUnquote(m[2]), head: m[1], literal: m[0] } : null
}

/** The secret keys of a JSON text that hold a value: any string or number, not an empty text. */
function secretKeys(json, directory) {
  let parsed
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  const keys = new Set()
  walk(parsed, (key, value) => {
    const filled = (typeof value === 'string' && value) || typeof value === 'number'
    if (filled && (isSecretKey(key) || (directory && key === 'username'))) keys.add(key)
  })
  return [...keys]
}

function walk(value, visit, key = '') {
  if (typeof value === 'string' || typeof value === 'number') visit(key, value)
  else if (Array.isArray(value)) for (const v of value) walk(v, visit, key)
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(v, visit, k)
}

/** Every `"key":"..."` or `"key":123` of a JSON text set to `""`, the rest of the text left as it was. */
function blankJsonKey(json, key) {
  const name = JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return json.replace(new RegExp(`(${name}\\s*:\\s*)(?:"(?:[^"\\\\]|\\\\.)*"|-?\\d[\\d.eE+-]*)`, 'g'), '$1""')
}
