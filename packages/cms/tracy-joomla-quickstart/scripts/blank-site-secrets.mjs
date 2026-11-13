/**
 * Secrets a Joomla demo database carries, and blanking them in place (blank site of an AI quickstart, ticket #582).
 *
 * Measured on JA Boxing j6 1.0.8: a directory service login in the LDAP plugin, a map API key in a plugin's params,
 * and a mailing extension's security key in its `name`/`value` settings table. Accounts and sessions are removed as
 * rows elsewhere (`blank-site.mjs`); this file finds the values that sit inside settings.
 */

import { records, setValue } from './joomla-sql-dump.mjs'

/** A setting name that holds a secret: `password`, `api_key`, `smtp_password`, `client_secret`, `update_token`... */
const SECRET_KEY =
  /(^|[_-])(password|passwd|secret|api_?key|apikey|token|private_?key|license_?key|security_?key)$/i

/**
 * Non-empty secrets, `{table, row, key}`: a secret-named key anywhere in an extension's params, the login of an
 * authentication plugin (a directory service credential), and a secret-named row of a `name`/`value` settings
 * table. Sorted, so two reports compare. Values are never returned.
 */
export function findSecrets(dump) {
  const found = []
  for (const part of dump.parts) {
    const settings = part.kind === 'insert' && part.columns.length === 2 && part.columns.includes('name')
    if (!settings || !part.columns.includes('value')) continue
    for (const r of records({ parts: [part] }, part.table)) {
      if (SECRET_KEY.test(r.name) && r.value) found.push({ table: part.table, row: r.name, key: 'value' })
    }
  }
  for (const r of records(dump, 'extensions')) {
    let params
    try {
      params = JSON.parse(r.params)
    } catch {
      continue
    }
    const directory = r.type === 'plugin' && r.folder === 'authentication'
    const keys = new Set()
    walkStrings(params, (key, value) => {
      if (value && (SECRET_KEY.test(key) || (directory && key === 'username'))) keys.add(key)
    })
    for (const key of keys) found.push({ table: 'extensions', row: r.extension_id, key })
  }
  const order = (s) => [s.table, s.row.padStart(12, '0'), s.key].join('\0')
  return found.sort((a, b) => (order(a) < order(b) ? -1 : 1))
}

/** Blank every secret `findSecrets` names; returns what was blanked. */
export function blankSecrets(dump) {
  const found = findSecrets(dump)
  for (const s of found) {
    if (s.table === 'extensions') {
      const row = records(dump, 'extensions').find((r) => r.extension_id === s.row)
      setValue(dump, 'extensions', (r) => r.extension_id === s.row, 'params', blankJsonKey(row.params, s.key))
    } else {
      setValue(dump, s.table, (r) => r.name === s.row, 'value', '')
    }
  }
  return found
}

function walkStrings(value, visit, key = '') {
  if (typeof value === 'string') visit(key, value)
  else if (Array.isArray(value)) for (const v of value) walkStrings(v, visit, key)
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) walkStrings(v, visit, k)
  }
}

/** Every `"key":"..."` of a JSON text set to `""`, the rest of the text left as it was (escapes included). */
function blankJsonKey(json, key) {
  const name = JSON.stringify(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return json.replace(new RegExp(`(${name}\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"`, 'g'), '$1""')
}
